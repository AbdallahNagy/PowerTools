using System.Reflection;
using System.ServiceModel;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Steps;

public sealed class DataverseStepOptionsGatewayTests
{
    [Theory]
    [InlineData("none")]
    [InlineData("None")]
    public async Task Options_stay_lightweight_and_selected_filter_metadata_skips_no_table_filters(string noTable)
    {
        var service = DispatchProxy.Create<IOrganizationServiceAsync2, OptionsServiceProxy>();
        var proxy = (OptionsServiceProxy)(object)service;
        proxy.NoTable = noTable;

        var options = await new DataversePluginRegistrationGateway(service)
            .RetrieveStepOptionsAsync(CancellationToken.None);

        var account = Assert.Single(options.Filters, filter => filter.PrimaryTable == "account");
        Assert.Empty(account.AvailableAttributes);
        Assert.Empty(Assert.Single(options.Filters, filter => filter.PrimaryTable == noTable).AvailableAttributes);
        var metadata = await new DataversePluginRegistrationGateway(service)
            .RetrieveStepFilterMetadataAsync(account.Id, CancellationToken.None);
        Assert.Equal("accountid", metadata.PrimaryIdAttribute);
        Assert.Equal(new[] { "accountid", "name" }, metadata.AvailableAttributes);
        Assert.Equal("Account", metadata.DisplayName);
        Assert.Equal("account", metadata.LogicalName);
        Assert.Equal("Account Name", Assert.Single(metadata.Attributes, item => item.LogicalName == "name").DisplayName);
        Assert.Single(options.Messages);
    }

    [Fact]
    public async Task Edit_details_load_when_an_unrelated_no_table_filter_exists()
    {
        var service = DispatchProxy.Create<IOrganizationServiceAsync2, OptionsServiceProxy>();
        var proxy = (OptionsServiceProxy)(object)service;

        var details = await new DataversePluginRegistrationGateway(service)
            .RetrieveStepEditDetailsAsync(proxy.StepId, CancellationToken.None);

        Assert.Equal(proxy.StepId, details.StepId);
        Assert.Equal("account", details.PrimaryTable);
        Assert.Equal(proxy.FilterId, details.SdkMessageFilterId);
    }

    [Fact]
    public async Task Options_return_each_filter_once_across_multiple_pages()
    {
        var service = DispatchProxy.Create<IOrganizationServiceAsync2, OptionsServiceProxy>();
        var proxy = (OptionsServiceProxy)(object)service;
        proxy.PageFilters = true;

        var options = await new DataversePluginRegistrationGateway(service)
            .RetrieveStepOptionsAsync(CancellationToken.None);

        Assert.Equal(2, options.Filters.Count);
        Assert.Contains(proxy.LastFilterQuery!.Orders, order => order.AttributeName == "sdkmessagefilterid");
        Assert.Single(options.Filters, filter => filter.Id == proxy.FilterId);
        Assert.Single(options.Filters, filter => filter.PrimaryTable == "none");
    }

    [Fact]
    public async Task Edit_details_load_when_filters_span_multiple_pages()
    {
        var service = DispatchProxy.Create<IOrganizationServiceAsync2, OptionsServiceProxy>();
        var proxy = (OptionsServiceProxy)(object)service;
        proxy.PageFilters = true;

        var details = await new DataversePluginRegistrationGateway(service)
            .RetrieveStepEditDetailsAsync(proxy.StepId, CancellationToken.None);

        Assert.Equal(proxy.FilterId, details.SdkMessageFilterId);
        Assert.Equal("account", details.PrimaryTable);
    }

    [Fact]
    public async Task Edit_details_return_description_and_stored_secure_configuration()
    {
        var service = DispatchProxy.Create<IOrganizationServiceAsync2, OptionsServiceProxy>();
        var proxy = (OptionsServiceProxy)(object)service;

        var details = await new DataversePluginRegistrationGateway(service)
            .RetrieveStepEditDetailsAsync(proxy.StepId, CancellationToken.None);

        Assert.Equal("Update step", details.Description);
        Assert.Equal("stored-secret", details.SecureConfiguration);
    }

    public class OptionsServiceProxy : DispatchProxy
    {
        public string NoTable { get; set; } = "none";
        public bool PageFilters { get; set; }
        public QueryExpression? LastFilterQuery { get; private set; }
        public Guid StepId { get; } = Guid.NewGuid();
        public Guid FilterId { get; } = Guid.NewGuid();
        public Guid SecureConfigId { get; } = Guid.NewGuid();
        private Guid PluginId { get; } = Guid.NewGuid();
        private Guid MessageId { get; } = Guid.NewGuid();

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            lock (this)
            {
            if (targetMethod?.Name == "RetrieveMultipleAsync")
            {
                var query = Assert.IsType<QueryExpression>(args![0]);
                if (query.EntityName == "sdkmessagefilter") LastFilterQuery = query;
                Entity[] rows = query.EntityName switch
                {
                    "sdkmessage" => [new("sdkmessage", MessageId) { ["name"] = "Update" }],
                    "sdkmessagefilter" =>
                    [
                        new("sdkmessagefilter", FilterId)
                        {
                            ["sdkmessageid"] = new EntityReference("sdkmessage", MessageId),
                            ["primaryobjecttypecode"] = "account"
                        },
                        new("sdkmessagefilter", Guid.NewGuid()) { ["primaryobjecttypecode"] = NoTable }
                    ],
                    "plugintype" => [new("plugintype", PluginId)],
                    "sdkmessageprocessingstep" => [new("sdkmessageprocessingstep", StepId)
                    {
                        ["plugintypeid"] = new EntityReference("plugintype", PluginId)
                    }],
                    _ => []
                };
                var page = new EntityCollection();
                if (PageFilters && query.EntityName == "sdkmessagefilter")
                {
                    // Dataverse treats an unspecified page (0) as the first page.
                    var firstPage = query.PageInfo.PageNumber <= 1;
                    page.Entities.Add(rows[firstPage ? 0 : 1]);
                    page.MoreRecords = firstPage;
                    page.PagingCookie = firstPage ? "filter-cookie" : null;
                    return Task.FromResult(page);
                }
                page.Entities.AddRange(rows);
                return Task.FromResult(page);
            }
            if (targetMethod?.Name == "RetrieveAsync")
            {
                var logicalName = Assert.IsType<string>(args![0]);
                return Task.FromResult(logicalName switch
                {
                    "plugintype" => new Entity("plugintype", PluginId) { ["versionnumber"] = 4L },
                    "sdkmessagefilter" => new Entity("sdkmessagefilter", FilterId)
                    {
                        ["primaryobjecttypecode"] = "account"
                    },
                    "sdkmessageprocessingstepsecureconfig" => new Entity("sdkmessageprocessingstepsecureconfig")
                    {
                        ["secureconfig"] = "stored-secret"
                    },
                    _ => new Entity("sdkmessageprocessingstep", StepId)
                    {
                        ["plugintypeid"] = new EntityReference("plugintype", PluginId),
                        ["sdkmessageid"] = new EntityReference("sdkmessage", MessageId),
                        ["sdkmessagefilterid"] = new EntityReference("sdkmessagefilter", FilterId),
                        ["sdkmessageprocessingstepsecureconfigid"] = new EntityReference("sdkmessageprocessingstepsecureconfig", SecureConfigId),
                        ["stage"] = new OptionSetValue(40), ["mode"] = new OptionSetValue(0),
                        ["rank"] = 1, ["versionnumber"] = 7L, ["description"] = "Update step"
                    }
                });
            }
            if (targetMethod?.Name == "ExecuteAsync")
            {
                var request = Assert.IsType<RetrieveEntityRequest>(args![0]);
                if (request.LogicalName != "account")
                    throw new FaultException<OrganizationServiceFault>(new()
                    {
                        ErrorCode = unchecked((int)0x80040217),
                        Message = $"Could not find an entity with name {request.LogicalName} and id {Guid.Empty}"
                    });
                var metadata = new EntityMetadata { LogicalName = "account" };
                typeof(EntityMetadata).GetProperty(nameof(EntityMetadata.PrimaryIdAttribute))!
                    .SetValue(metadata, "accountid");
                typeof(EntityMetadata).GetProperty(nameof(EntityMetadata.DisplayName))!
                    .SetValue(metadata, new Label("Account", 1033));
                typeof(EntityMetadata).GetProperty(nameof(EntityMetadata.Attributes))!
                    .SetValue(metadata, new AttributeMetadata[]
                    {
                        new StringAttributeMetadata { LogicalName = "accountid", DisplayName = new Label("Account", 1033) },
                        new StringAttributeMetadata { LogicalName = "name", DisplayName = new Label("Account Name", 1033) }
                    });
                var response = new RetrieveEntityResponse();
                response.Results["EntityMetadata"] = metadata;
                return Task.FromResult<OrganizationResponse>(response);
            }
            throw new NotSupportedException(targetMethod?.Name);
            }
        }
    }
}
