using System.Collections.Immutable;
using System.Buffers.Binary;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Security.Cryptography;
using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public sealed class PluginAssemblyInspector : IPluginAssemblyInspector
{
    public const long MaxAssemblyBytes = 16 * 1024 * 1024;

    private const string PluginInterfaceName = "Microsoft.Xrm.Sdk.IPlugin";
    private const string CodeActivityName = "System.Activities.CodeActivity";
    private const string InputAttributeName =
        "Microsoft.Xrm.Sdk.Workflow.InputAttribute";
    private const string OutputAttributeName =
        "Microsoft.Xrm.Sdk.Workflow.OutputAttribute";
    private const string ReferenceTargetAttributeName =
        "Microsoft.Xrm.Sdk.Workflow.ReferenceTargetAttribute";
    private const string RequiredArgumentAttributeName =
        "System.Activities.RequiredArgumentAttribute";
    private const string TargetFrameworkAttributeName =
        "System.Runtime.Versioning.TargetFrameworkAttribute";
    private const string SupportedTargetFramework =
        ".NETFramework,Version=v4.6.2";
    private const string SupportedRuntimeVersion = "v4.0.30319";

    public async Task<AssemblyInspectionDto> InspectAsync(
        Stream assembly,
        string fileName,
        long length,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(assembly);

        if (length <= 0)
        {
            throw Validation(
                AssemblyInspectionValidationCodes.Empty,
                "The assembly file is empty.");
        }

        if (length > MaxAssemblyBytes)
        {
            throw Validation(
                AssemblyInspectionValidationCodes.TooLarge,
                $"The assembly exceeds the {MaxAssemblyBytes}-byte limit.");
        }

        cancellationToken.ThrowIfCancellationRequested();
        var copyBuffer = new byte[64 * 1024];
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        using var content = new MemoryStream((int)Math.Min(length, MaxAssemblyBytes));

        try
        {
            long actualLength = 0;
            while (true)
            {
                var read = await assembly.ReadAsync(
                    copyBuffer.AsMemory(), cancellationToken);
                if (read == 0)
                    break;

                actualLength += read;
                if (actualLength > MaxAssemblyBytes)
                {
                    throw Validation(
                        AssemblyInspectionValidationCodes.TooLarge,
                        $"The assembly exceeds the {MaxAssemblyBytes}-byte limit.");
                }

                hash.AppendData(copyBuffer.AsSpan(0, read));
                await content.WriteAsync(
                    copyBuffer.AsMemory(0, read), cancellationToken);
            }

            if (actualLength == 0)
            {
                throw Validation(
                    AssemblyInspectionValidationCodes.Empty,
                    "The assembly file is empty.");
            }

            content.Position = 0;
            var sha256 = Convert.ToHexString(hash.GetHashAndReset())
                .ToLowerInvariant();
            return InspectMetadata(
                content,
                SafeFileName(fileName),
                actualLength,
                sha256);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(copyBuffer);
            if (content.TryGetBuffer(out var contentBuffer))
            {
                CryptographicOperations.ZeroMemory(
                    contentBuffer.AsSpan(0, (int)content.Length));
            }
        }
    }

    private static AssemblyInspectionDto InspectMetadata(
        Stream content,
        string fileName,
        long size,
        string sha256)
    {
        try
        {
            using var pe = new PEReader(content, PEStreamOptions.LeaveOpen);
            if (!pe.HasMetadata)
            {
                throw Validation(
                    AssemblyInspectionValidationCodes.NotManaged,
                    "The file is not a managed PE assembly.");
            }

            var metadata = pe.GetMetadataReader();
            if (!metadata.IsAssembly)
            {
                throw Validation(
                    AssemblyInspectionValidationCodes.MissingAssemblyMetadata,
                    "The managed file does not contain assembly metadata.");
            }

            var assembly = metadata.GetAssemblyDefinition();
            var publicKey = metadata.GetBlobBytes(assembly.PublicKey);
            if ((assembly.Flags & AssemblyFlags.PublicKey) == 0
                || publicKey.Length == 0
                || pe.PEHeaders.CorHeader is not
                {
                    Flags: var corFlags,
                    StrongNameSignatureDirectory.Size: > 0
                }
                || (corFlags & CorFlags.StrongNameSigned) == 0)
            {
                throw Validation(
                    AssemblyInspectionValidationCodes.Unsigned,
                    "The assembly must be strong-name signed.");
            }

            if (!VerifyStrongNameSignature(pe, publicKey))
            {
                throw Validation(
                    AssemblyInspectionValidationCodes.InvalidStrongName,
                    "The assembly strong-name signature is invalid.");
            }

            var targetFramework = ReadTargetFramework(metadata, assembly);
            var runtimeVersion = metadata.MetadataVersion;
            var diagnostics = BuildDiagnostics(targetFramework, runtimeVersion);
            var plugins = new List<PluginTypeInspectionDto>();
            var workflowActivities = new List<WorkflowActivityInspectionDto>();
            var signatureProvider = new MetadataSignatureTypeProvider();

            foreach (var typeHandle in metadata.TypeDefinitions)
            {
                var type = metadata.GetTypeDefinition(typeHandle);
                if (!IsPublicConcreteClass(type))
                    continue;

                var typeName = GetFullName(metadata, typeHandle);
                if (ImplementsInterface(
                        metadata,
                        type,
                        PluginInterfaceName,
                        new HashSet<TypeDefinitionHandle>()))
                    plugins.Add(new PluginTypeInspectionDto(typeName));

                if (DerivesFrom(metadata, type.BaseType, CodeActivityName,
                        new HashSet<TypeDefinitionHandle>()))
                {
                    workflowActivities.Add(new WorkflowActivityInspectionDto(
                        typeName,
                        ReadWorkflowArguments(metadata, type, signatureProvider)));
                }
            }

            plugins.Sort((left, right) =>
                StringComparer.Ordinal.Compare(left.TypeName, right.TypeName));
            workflowActivities.Sort((left, right) =>
                StringComparer.Ordinal.Compare(left.TypeName, right.TypeName));

            return new AssemblyInspectionDto(
                fileName,
                size,
                sha256,
                new AssemblyIdentityInspectionDto(
                    metadata.GetString(assembly.Name),
                    assembly.Version.ToString(),
                    assembly.Culture.IsNil
                        ? "neutral"
                        : metadata.GetString(assembly.Culture),
                    ComputePublicKeyToken(publicKey)),
                targetFramework,
                runtimeVersion,
                diagnostics,
                plugins,
                workflowActivities);
        }
        catch (AssemblyInspectionValidationException)
        {
            throw;
        }
        catch (BadImageFormatException)
        {
            throw Validation(
                AssemblyInspectionValidationCodes.InvalidPe,
                "The file is not a valid managed PE assembly.");
        }
        catch (IOException)
        {
            throw Validation(
                AssemblyInspectionValidationCodes.InvalidPe,
                "The file is not a valid managed PE assembly.");
        }
        catch (InvalidOperationException)
        {
            throw Validation(
                AssemblyInspectionValidationCodes.InvalidPe,
                "The file is not a valid managed PE assembly.");
        }
        catch (ArgumentException)
        {
            throw Validation(
                AssemblyInspectionValidationCodes.InvalidPe,
                "The file is not a valid managed PE assembly.");
        }
        catch (IndexOutOfRangeException)
        {
            throw Validation(
                AssemblyInspectionValidationCodes.InvalidPe,
                "The file is not a valid managed PE assembly.");
        }
        catch (OverflowException)
        {
            throw Validation(
                AssemblyInspectionValidationCodes.InvalidPe,
                "The file is not a valid managed PE assembly.");
        }
    }

    private static bool VerifyStrongNameSignature(PEReader pe, byte[] publicKey)
    {
        byte[]? image = null;
        byte[]? signature = null;
        try
        {
            var corHeader = pe.PEHeaders.CorHeader;
            if (corHeader is null)
                return false;

            image = pe.GetEntireImage().GetContent().ToArray();
            var signatureDirectory = corHeader.StrongNameSignatureDirectory;
            var signatureOffset = RvaToFileOffset(
                pe.PEHeaders,
                signatureDirectory.RelativeVirtualAddress,
                signatureDirectory.Size,
                image.Length);
            if (signatureOffset < 0)
                return false;

            signature = image.AsSpan(signatureOffset, signatureDirectory.Size).ToArray();
            var optionalHeaderOffset = GetOptionalHeaderOffset(image);
            image.AsSpan(optionalHeaderOffset + 64, sizeof(uint)).Clear();
            image.AsSpan(GetCertificateDirectoryOffset(image, optionalHeaderOffset), 8)
                .Clear();

            if (!TryReadStrongNamePublicKey(publicKey, out var parameters))
            {
                return false;
            }

            Array.Reverse(signature);
            var hash = ComputeStrongNameHash(
                image,
                pe.PEHeaders,
                signatureOffset,
                signatureDirectory.Size);
            try
            {
                using var rsa = RSA.Create();
                rsa.ImportParameters(parameters);
                return rsa.VerifyHash(
                    hash,
                    signature,
                    HashAlgorithmName.SHA1,
                    RSASignaturePadding.Pkcs1);
            }
            finally
            {
                CryptographicOperations.ZeroMemory(hash);
            }
        }
        catch (ArgumentException)
        {
            return false;
        }
        catch (CryptographicException)
        {
            return false;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
        finally
        {
            if (signature is not null)
                CryptographicOperations.ZeroMemory(signature);
            if (image is not null)
                CryptographicOperations.ZeroMemory(image);
        }
    }

    private static int GetOptionalHeaderOffset(ReadOnlySpan<byte> image)
    {
        const int dosHeaderPeOffset = 0x3c;
        const int coffHeaderSize = 20;
        const int peSignatureSize = 4;
        if (image.Length < dosHeaderPeOffset + sizeof(uint))
            throw new ArgumentException("Invalid PE header.");

        var peOffset = BinaryPrimitives.ReadInt32LittleEndian(
            image.Slice(dosHeaderPeOffset, sizeof(int)));
        var optionalHeaderOffset = checked(peOffset + peSignatureSize + coffHeaderSize);
        if (peOffset < 0 || image.Length < optionalHeaderOffset + 68)
            throw new ArgumentException("Invalid PE header.");

        return optionalHeaderOffset;
    }

    private static int GetCertificateDirectoryOffset(
        ReadOnlySpan<byte> image,
        int optionalHeaderOffset)
    {
        const ushort pe32 = 0x10b;
        const ushort pe32Plus = 0x20b;
        var magic = BinaryPrimitives.ReadUInt16LittleEndian(
            image.Slice(optionalHeaderOffset, sizeof(ushort)));
        var dataDirectoryOffset = magic switch
        {
            pe32 => 96,
            pe32Plus => 112,
            _ => throw new ArgumentException("Invalid PE optional header.")
        };
        var certificateDirectoryOffset = checked(
            optionalHeaderOffset + dataDirectoryOffset + (4 * 8));
        if (image.Length < certificateDirectoryOffset + 8)
            throw new ArgumentException("Invalid PE optional header.");

        return certificateDirectoryOffset;
    }

    private static int RvaToFileOffset(
        PEHeaders headers,
        int rva,
        int size,
        int imageLength)
    {
        if (rva < 0 || size <= 0)
            return -1;

        if (rva < headers.PEHeader?.SizeOfHeaders)
            return IsRangeInImage(rva, size, imageLength) ? rva : -1;

        foreach (var section in headers.SectionHeaders)
        {
            var relativeOffset = (long)rva - section.VirtualAddress;
            if (relativeOffset < 0 || relativeOffset > section.SizeOfRawData
                || size > section.SizeOfRawData - relativeOffset)
            {
                continue;
            }

            var fileOffset = (long)section.PointerToRawData + relativeOffset;
            return IsRangeInImage(fileOffset, size, imageLength)
                ? (int)fileOffset
                : -1;
        }

        return -1;
    }

    private static bool IsRangeInImage(long offset, int size, int imageLength) =>
        offset >= 0 && size >= 0 && offset <= imageLength - (long)size;

    private static byte[] ComputeStrongNameHash(
        byte[] image,
        PEHeaders headers,
        int strongNameOffset,
        int strongNameSize)
    {
        var peHeader = headers.PEHeader
            ?? throw new ArgumentException("Missing PE header.");
        var peHeadersSize = checked(
            headers.PEHeaderStartOffset
            + (peHeader.Magic == PEMagic.PE32 ? 0xe0 : 0xf0)
            + (headers.SectionHeaders.Length * 40));
        if (!IsRangeInImage(0, peHeadersSize, image.Length))
            throw new ArgumentException("Invalid PE headers.");

        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA1);
        hash.AppendData(image, 0, peHeadersSize);
        var strongNameEnd = checked(strongNameOffset + strongNameSize);
        foreach (var section in headers.SectionHeaders)
        {
            var sectionOffset = section.PointerToRawData;
            var sectionSize = section.SizeOfRawData;
            var sectionEnd = checked(sectionOffset + sectionSize);
            if (!IsRangeInImage(sectionOffset, sectionSize, image.Length))
                throw new ArgumentException("Invalid PE section.");

            if (strongNameEnd <= sectionOffset || strongNameOffset >= sectionEnd)
            {
                hash.AppendData(image, sectionOffset, sectionSize);
                continue;
            }

            hash.AppendData(image, sectionOffset, strongNameOffset - sectionOffset);
            hash.AppendData(image, strongNameEnd, sectionEnd - strongNameEnd);
        }

        return hash.GetHashAndReset();
    }

    private static bool TryReadStrongNamePublicKey(
        ReadOnlySpan<byte> publicKey,
        out RSAParameters parameters)
    {
        const uint rsaSignAlgorithm = 0x00002400;
        const uint rsaPublicKeyMagic = 0x31415352;
        const int publicKeyHeaderSize = 12;
        const int rsaPublicKeyOffset = publicKeyHeaderSize + 8;
        const int modulusOffset = rsaPublicKeyOffset + 12;

        parameters = default;
        if (publicKey.Length < modulusOffset)
            return false;

        var signatureAlgorithm = BinaryPrimitives.ReadUInt32LittleEndian(
            publicKey.Slice(0, sizeof(uint)));
        var declaredPublicKeySize = BinaryPrimitives.ReadUInt32LittleEndian(
            publicKey.Slice(sizeof(uint) * 2, sizeof(uint)));
        if (signatureAlgorithm is not 0 and not rsaSignAlgorithm
            || declaredPublicKeySize != publicKey.Length - publicKeyHeaderSize
            || publicKey[publicKeyHeaderSize] != 0x06
            || BinaryPrimitives.ReadUInt32LittleEndian(
                publicKey.Slice(rsaPublicKeyOffset, sizeof(uint))) != rsaPublicKeyMagic)
        {
            return false;
        }

        var bitLength = BinaryPrimitives.ReadUInt32LittleEndian(
            publicKey.Slice(rsaPublicKeyOffset + sizeof(uint), sizeof(uint)));
        var exponent = BinaryPrimitives.ReadUInt32LittleEndian(
            publicKey.Slice(rsaPublicKeyOffset + (sizeof(uint) * 2), sizeof(uint)));
        if (bitLength == 0 || bitLength % 8 != 0 || exponent == 0
            || bitLength / 8 != publicKey.Length - modulusOffset)
        {
            return false;
        }

        var modulus = publicKey[modulusOffset..].ToArray();
        Array.Reverse(modulus);
        parameters = new RSAParameters
        {
            Exponent = ToBigEndianBytes(exponent),
            Modulus = modulus
        };
        return true;
    }

    private static byte[] ToBigEndianBytes(uint value)
    {
        Span<byte> bytes = stackalloc byte[sizeof(uint)];
        BinaryPrimitives.WriteUInt32BigEndian(bytes, value);
        var firstValueByte = 0;
        while (firstValueByte < bytes.Length - 1 && bytes[firstValueByte] == 0)
            firstValueByte++;
        return bytes[firstValueByte..].ToArray();
    }

    private static IReadOnlyList<AssemblyInspectionDiagnosticDto> BuildDiagnostics(
        string? targetFramework,
        string runtimeVersion)
    {
        var diagnostics = new List<AssemblyInspectionDiagnosticDto>();
        if (targetFramework is null)
        {
            diagnostics.Add(new AssemblyInspectionDiagnosticDto(
                "target_framework_unknown",
                "The assembly does not declare a target framework.",
                AssemblyInspectionDiagnosticSeverity.Warning));
        }
        else if (!string.Equals(
                     targetFramework,
                     SupportedTargetFramework,
                     StringComparison.Ordinal))
        {
            diagnostics.Add(new AssemblyInspectionDiagnosticDto(
                "target_framework_unsupported",
                $"The assembly targets {targetFramework}; PowerTools supports {SupportedTargetFramework}.",
                AssemblyInspectionDiagnosticSeverity.Error));
        }

        if (!string.Equals(
                runtimeVersion,
                SupportedRuntimeVersion,
                StringComparison.Ordinal))
        {
            diagnostics.Add(new AssemblyInspectionDiagnosticDto(
                "runtime_version_unsupported",
                $"The assembly metadata runtime is {runtimeVersion}; PowerTools supports {SupportedRuntimeVersion}.",
                AssemblyInspectionDiagnosticSeverity.Error));
        }

        return diagnostics;
    }

    private static string? ReadTargetFramework(
        MetadataReader metadata,
        AssemblyDefinition assembly)
    {
        foreach (var attributeHandle in assembly.GetCustomAttributes())
        {
            var attribute = metadata.GetCustomAttribute(attributeHandle);
            if (!string.Equals(
                    GetAttributeTypeFullName(metadata, attribute),
                    TargetFrameworkAttributeName,
                    StringComparison.Ordinal))
            {
                continue;
            }

            return ReadFirstStringArgument(metadata, attribute);
        }

        return null;
    }

    private static IReadOnlyList<WorkflowArgumentInspectionDto>
        ReadWorkflowArguments(
            MetadataReader metadata,
            TypeDefinition type,
            MetadataSignatureTypeProvider signatureProvider)
    {
        var arguments = new List<WorkflowArgumentInspectionDto>();
        foreach (var propertyHandle in type.GetProperties())
        {
            var property = metadata.GetPropertyDefinition(propertyHandle);
            string? inputName = null;
            string? outputName = null;
            string? referenceTarget = null;
            var isRequired = false;

            foreach (var attributeHandle in property.GetCustomAttributes())
            {
                var attribute = metadata.GetCustomAttribute(attributeHandle);
                switch (GetAttributeTypeFullName(metadata, attribute))
                {
                    case InputAttributeName:
                        inputName = ReadFirstStringArgument(metadata, attribute);
                        break;
                    case OutputAttributeName:
                        outputName = ReadFirstStringArgument(metadata, attribute);
                        break;
                    case ReferenceTargetAttributeName:
                        referenceTarget = ReadFirstStringArgument(metadata, attribute);
                        break;
                    case RequiredArgumentAttributeName:
                        isRequired = true;
                        break;
                }
            }

            if (inputName is null && outputName is null)
                continue;

            var signature = property.DecodeSignature(
                signatureProvider,
                genericContext: null);
            if (!TryReadArgumentType(
                    signature.ReturnType,
                    out var direction,
                    out var argumentType))
            {
                continue;
            }

            var propertyName = metadata.GetString(property.Name);
            arguments.Add(new WorkflowArgumentInspectionDto(
                propertyName,
                inputName ?? outputName ?? propertyName,
                argumentType,
                direction,
                isRequired,
                referenceTarget));
        }

        arguments.Sort((left, right) =>
            StringComparer.Ordinal.Compare(left.PropertyName, right.PropertyName));
        return arguments;
    }

    private static bool TryReadArgumentType(
        MetadataType propertyType,
        out WorkflowArgumentDirection direction,
        out string argumentType)
    {
        direction = default;
        argumentType = string.Empty;
        if (propertyType.GenericArguments.Length != 1)
            return false;

        switch (propertyType.FullName)
        {
            case "System.Activities.InArgument`1":
                direction = WorkflowArgumentDirection.Input;
                break;
            case "System.Activities.OutArgument`1":
                direction = WorkflowArgumentDirection.Output;
                break;
            default:
                return false;
        }

        argumentType = propertyType.GenericArguments[0].DisplayName;
        return true;
    }

    private static bool IsPublicConcreteClass(TypeDefinition type)
    {
        var visibility = type.Attributes & TypeAttributes.VisibilityMask;
        return visibility is TypeAttributes.Public or TypeAttributes.NestedPublic
            && (type.Attributes & TypeAttributes.Interface) == 0
            && (type.Attributes & TypeAttributes.Abstract) == 0;
    }

    private static bool ImplementsInterface(
        MetadataReader metadata,
        TypeDefinition type,
        string interfaceFullName,
        HashSet<TypeDefinitionHandle> visited)
    {
        foreach (var interfaceHandle in type.GetInterfaceImplementations())
        {
            var implementation = metadata.GetInterfaceImplementation(interfaceHandle);
            if (string.Equals(
                    GetFullName(metadata, implementation.Interface),
                    interfaceFullName,
                    StringComparison.Ordinal))
            {
                return true;
            }
        }

        if (type.BaseType.Kind != HandleKind.TypeDefinition)
            return false;

        var baseTypeHandle = (TypeDefinitionHandle)type.BaseType;
        return visited.Add(baseTypeHandle)
            && ImplementsInterface(
                metadata,
                metadata.GetTypeDefinition(baseTypeHandle),
                interfaceFullName,
                visited);
    }

    private static bool DerivesFrom(
        MetadataReader metadata,
        EntityHandle baseType,
        string expectedFullName,
        HashSet<TypeDefinitionHandle> visited)
    {
        if (baseType.IsNil)
            return false;

        if (string.Equals(
                GetFullName(metadata, baseType),
                expectedFullName,
                StringComparison.Ordinal))
        {
            return true;
        }

        if (baseType.Kind != HandleKind.TypeDefinition)
            return false;

        var definitionHandle = (TypeDefinitionHandle)baseType;
        if (!visited.Add(definitionHandle))
            return false;

        return DerivesFrom(
            metadata,
            metadata.GetTypeDefinition(definitionHandle).BaseType,
            expectedFullName,
            visited);
    }

    private static string GetAttributeTypeFullName(
        MetadataReader metadata,
        CustomAttribute attribute)
    {
        EntityHandle typeHandle = attribute.Constructor.Kind switch
        {
            HandleKind.MemberReference => metadata
                .GetMemberReference((MemberReferenceHandle)attribute.Constructor)
                .Parent,
            HandleKind.MethodDefinition => metadata
                .GetMethodDefinition((MethodDefinitionHandle)attribute.Constructor)
                .GetDeclaringType(),
            _ => default
        };
        return typeHandle.IsNil ? string.Empty : GetFullName(metadata, typeHandle);
    }

    private static string? ReadFirstStringArgument(
        MetadataReader metadata,
        CustomAttribute attribute)
    {
        try
        {
            var value = metadata.GetBlobReader(attribute.Value);
            return value.ReadUInt16() == 1
                ? value.ReadSerializedString()
                : null;
        }
        catch (BadImageFormatException)
        {
            return null;
        }
    }

    private static string GetFullName(
        MetadataReader metadata,
        EntityHandle handle) => handle.Kind switch
    {
        HandleKind.TypeDefinition => GetFullName(
            metadata,
            (TypeDefinitionHandle)handle),
        HandleKind.TypeReference => GetFullName(
            metadata,
            (TypeReferenceHandle)handle),
        _ => string.Empty
    };

    private static string GetFullName(
        MetadataReader metadata,
        TypeDefinitionHandle handle)
    {
        var type = metadata.GetTypeDefinition(handle);
        var name = metadata.GetString(type.Name);
        var declaringType = type.GetDeclaringType();
        if (!declaringType.IsNil)
            return $"{GetFullName(metadata, declaringType)}+{name}";

        var ns = metadata.GetString(type.Namespace);
        return string.IsNullOrEmpty(ns) ? name : $"{ns}.{name}";
    }

    private static string GetFullName(
        MetadataReader metadata,
        TypeReferenceHandle handle)
    {
        var type = metadata.GetTypeReference(handle);
        var name = metadata.GetString(type.Name);
        if (type.ResolutionScope.Kind == HandleKind.TypeReference)
        {
            return $"{GetFullName(metadata, (TypeReferenceHandle)type.ResolutionScope)}+{name}";
        }

        var ns = metadata.GetString(type.Namespace);
        return string.IsNullOrEmpty(ns) ? name : $"{ns}.{name}";
    }

    private static string ComputePublicKeyToken(byte[] publicKey)
    {
        // Strong-name public-key tokens are defined as the reversed final
        // eight bytes of SHA-1. The hostile file's content digest remains SHA-256.
        var hash = SHA1.HashData(publicKey);
        Span<byte> token = stackalloc byte[8];
        for (var i = 0; i < token.Length; i++)
            token[i] = hash[hash.Length - 1 - i];
        CryptographicOperations.ZeroMemory(hash);
        return Convert.ToHexString(token).ToLowerInvariant();
    }

    private static string SafeFileName(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return "assembly.dll";

        return Path.GetFileName(fileName.Replace('\\', '/'));
    }

    private static AssemblyInspectionValidationException Validation(
        string code,
        string message) => new(code, message);

    private sealed record MetadataType(
        string FullName,
        ImmutableArray<MetadataType> GenericArguments)
    {
        public string DisplayName => GenericArguments.IsDefaultOrEmpty
            ? FullName
            : $"{FullName[..FullName.IndexOf('`')]}<{string.Join(",", GenericArguments.Select(type => type.DisplayName))}>";

        public static MetadataType Named(string fullName) =>
            new(fullName, ImmutableArray<MetadataType>.Empty);
    }

    private sealed class MetadataSignatureTypeProvider :
        ISignatureTypeProvider<MetadataType, object?>
    {
        public MetadataType GetArrayType(MetadataType elementType, ArrayShape shape) =>
            MetadataType.Named($"{elementType.DisplayName}[{new string(',', shape.Rank - 1)}]");

        public MetadataType GetByReferenceType(MetadataType elementType) =>
            MetadataType.Named($"{elementType.DisplayName}&");

        public MetadataType GetFunctionPointerType(
            MethodSignature<MetadataType> signature) =>
            MetadataType.Named("methodptr");

        public MetadataType GetGenericInstantiation(
            MetadataType genericType,
            ImmutableArray<MetadataType> typeArguments) =>
            new(genericType.FullName, typeArguments);

        public MetadataType GetGenericMethodParameter(object? genericContext, int index) =>
            MetadataType.Named($"!!{index}");

        public MetadataType GetGenericTypeParameter(object? genericContext, int index) =>
            MetadataType.Named($"!{index}");

        public MetadataType GetModifiedType(
            MetadataType modifier,
            MetadataType unmodifiedType,
            bool isRequired) => unmodifiedType;

        public MetadataType GetPinnedType(MetadataType elementType) => elementType;

        public MetadataType GetPointerType(MetadataType elementType) =>
            MetadataType.Named($"{elementType.DisplayName}*");

        public MetadataType GetPrimitiveType(PrimitiveTypeCode typeCode) =>
            MetadataType.Named(typeCode switch
            {
                PrimitiveTypeCode.Boolean => "System.Boolean",
                PrimitiveTypeCode.Byte => "System.Byte",
                PrimitiveTypeCode.Char => "System.Char",
                PrimitiveTypeCode.Double => "System.Double",
                PrimitiveTypeCode.Int16 => "System.Int16",
                PrimitiveTypeCode.Int32 => "System.Int32",
                PrimitiveTypeCode.Int64 => "System.Int64",
                PrimitiveTypeCode.IntPtr => "System.IntPtr",
                PrimitiveTypeCode.Object => "System.Object",
                PrimitiveTypeCode.SByte => "System.SByte",
                PrimitiveTypeCode.Single => "System.Single",
                PrimitiveTypeCode.String => "System.String",
                PrimitiveTypeCode.UInt16 => "System.UInt16",
                PrimitiveTypeCode.UInt32 => "System.UInt32",
                PrimitiveTypeCode.UInt64 => "System.UInt64",
                PrimitiveTypeCode.UIntPtr => "System.UIntPtr",
                PrimitiveTypeCode.Void => "System.Void",
                _ => typeCode.ToString()
            });

        public MetadataType GetSZArrayType(MetadataType elementType) =>
            MetadataType.Named($"{elementType.DisplayName}[]");

        public MetadataType GetTypeFromDefinition(
            MetadataReader reader,
            TypeDefinitionHandle handle,
            byte rawTypeKind) => MetadataType.Named(GetFullName(reader, handle));

        public MetadataType GetTypeFromReference(
            MetadataReader reader,
            TypeReferenceHandle handle,
            byte rawTypeKind) => MetadataType.Named(GetFullName(reader, handle));

        public MetadataType GetTypeFromSpecification(
            MetadataReader reader,
            object? genericContext,
            TypeSpecificationHandle handle,
            byte rawTypeKind) => reader
                .GetTypeSpecification(handle)
                .DecodeSignature(this, genericContext);
    }
}
