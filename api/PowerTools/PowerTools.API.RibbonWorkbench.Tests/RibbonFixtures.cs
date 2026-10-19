using System.IO.Compression;
using System.Text;

namespace PowerTools.API.RibbonWorkbench.Tests;

/// <summary>Small solution and ribbon files written for these tests. Nothing is copied from a real export.</summary>
public static class RibbonFixtures
{
    public const string AccountDiff =
        """
        <RibbonDiffXml>
          <CustomActions>
            <CustomAction Id="new.account.Hello.CustomAction" Location="Mscrm.HomepageGrid.account.MainTab.Actions.Controls._children" Sequence="10">
              <CommandUIDefinition>
                <Button Id="new.account.Hello.Button" Command="new.account.Hello.Command" LabelText="$LocLabels:new.account.Hello.Label" Sequence="10" TemplateAlias="o1" />
              </CommandUIDefinition>
            </CustomAction>
          </CustomActions>
          <Templates>
            <RibbonTemplates Id="Mscrm.RTE.Templates" />
          </Templates>
          <CommandDefinitions>
            <CommandDefinition Id="new.account.Hello.Command">
              <EnableRules>
                <EnableRule Id="Mscrm.Enabled" />
              </EnableRules>
              <DisplayRules>
                <DisplayRule Id="new.account.IsOwner" />
              </DisplayRules>
              <Actions>
                <JavaScriptFunction FunctionName="hello" Library="$webresource:new_/scripts/hello.js">
                  <CrmParameter Value="PrimaryControl" />
                </JavaScriptFunction>
              </Actions>
            </CommandDefinition>
          </CommandDefinitions>
          <RuleDefinitions>
            <TabDisplayRules />
            <DisplayRules>
              <DisplayRule Id="new.account.IsOwner">
                <EntityPrivilegeRule PrivilegeType="Write" PrivilegeDepth="Basic" AppliesTo="PrimaryEntity" />
              </DisplayRule>
            </DisplayRules>
            <EnableRules />
          </RuleDefinitions>
          <LocLabels>
            <LocLabel Id="new.account.Hello.Label">
              <Titles>
                <Title languagecode="1033" description="Hello" />
              </Titles>
            </LocLabel>
          </LocLabels>
        </RibbonDiffXml>
        """;

    public static string Customizations(bool withApplicationDiff = true, string accountDiff = AccountDiff) =>
        $"""
        <?xml version="1.0" encoding="utf-8"?>
        <ImportExportXml version="9.2" SolutionPackageVersion="9.2" languagecode="1033" generatedBy="CrmLive">
          <Entities>
            <Entity>
              <Name LocalizedName="Account" OriginalName="Account">Account</Name>
              <EntityInfo>
                <entity Name="account">
                  <attributes />
                </entity>
              </EntityInfo>
              <FormXml />
              <SavedQueries />
              {accountDiff}
            </Entity>
            <Entity>
              <Name LocalizedName="Queue" OriginalName="Queue">Queue</Name>
              <EntityInfo>
                <entity Name="queue" />
              </EntityInfo>
              <RibbonDiffXml>
                <RibbonNotSupported />
              </RibbonDiffXml>
            </Entity>
            <Entity>
              <Name LocalizedName="Contact" OriginalName="Contact">Contact</Name>
            </Entity>
          </Entities>
          <Roles />
          <Workflows />
          {(withApplicationDiff ? "<RibbonDiffXml><CustomActions /><Templates><RibbonTemplates Id=\"Mscrm.RTE.Templates\" /></Templates><CommandDefinitions /><RuleDefinitions><TabDisplayRules /><DisplayRules /><EnableRules /></RuleDefinitions><LocLabels /></RibbonDiffXml>" : "")}
          <Languages>
            <Language>1033</Language>
          </Languages>
        </ImportExportXml>
        """;

    public static string Manifest(params int[] rootTypes) =>
        $"""
        <?xml version="1.0" encoding="utf-8"?>
        <ImportExportXml version="9.2">
          <SolutionManifest>
            <UniqueName>new_RibbonEdits</UniqueName>
            <Managed>0</Managed>
            <RootComponents>
              {string.Join("", rootTypes.Select(type => $"<RootComponent type=\"{type}\" schemaName=\"c{type}\" behavior=\"0\" />"))}
            </RootComponents>
          </SolutionManifest>
        </ImportExportXml>
        """;

    public static byte[] Solution(string? customizations = null, string? manifest = null, bool includeCustomizations = true)
    {
        var files = new Dictionary<string, string>
        {
            ["[Content_Types].xml"] = "<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\" />",
            ["solution.xml"] = manifest ?? Manifest(1, 1, 1, 50),
        };
        if (includeCustomizations) files["customizations.xml"] = customizations ?? Customizations();
        return Zip(files);
    }

    public const string EntityRibbonXml =
        """
        <RibbonDefinitions>
          <RibbonDefinition>
            <UI>
              <Ribbon>
                <Tabs Id="Mscrm.Tabs">
                  <Tab Id="Mscrm.HomepageGrid.account.MainTab" Command="Mscrm.HomepageGrid.account.MainTab" Title="Accounts" Sequence="10">
                    <Scaling Id="Mscrm.HomepageGrid.account.MainTab.Scaling" />
                    <Groups Id="Mscrm.HomepageGrid.account.MainTab.Groups">
                      <Group Id="Mscrm.HomepageGrid.account.MainTab.Actions" Command="Mscrm.Enabled" Sequence="10" Title="Actions" Template="Mscrm.Templates.Flexible2">
                        <Controls Id="Mscrm.HomepageGrid.account.MainTab.Actions.Controls">
                          <Button Id="Mscrm.HomepageGrid.account.NewRecord" Command="Mscrm.NewRecordFromGrid" Sequence="10" LabelText="$Resources:New" TemplateAlias="o1" />
                          <Button Id="Mscrm.HomepageGrid.account.DeleteMenu" Command="Mscrm.HomepageGrid.DeleteSplitButtonCommand" Sequence="20" LabelText="Delete" TemplateAlias="o1" />
                        </Controls>
                      </Group>
                    </Groups>
                  </Tab>
                  <Tab Id="Mscrm.Form.account.MainTab" Title="Account" Sequence="10">
                    <Groups Id="Mscrm.Form.account.MainTab.Groups" />
                  </Tab>
                </Tabs>
                <ContextualTabs Id="Mscrm.ContextualTabs">
                  <ContextualGroup Id="Mscrm.SubGrid.account.ContextualTabs" Command="Mscrm.SubGrid.account.ContextualTabs" Color="Orange" ContextualGroupId="Mscrm.SubGrid.account.ContextualTabs">
                    <Tab Id="Mscrm.SubGrid.account.MainTab" Title="Accounts" Sequence="5">
                      <Groups Id="Mscrm.SubGrid.account.MainTab.Groups" />
                    </Tab>
                  </ContextualGroup>
                </ContextualTabs>
              </Ribbon>
            </UI>
            <Templates>
              <RibbonTemplates Id="Mscrm.Templates">
                <GroupTemplate Id="Mscrm.Templates.Flexible2">
                  <Layout Title="LargeMedium" />
                  <Layout Title="LargeSmall" />
                </GroupTemplate>
              </RibbonTemplates>
            </Templates>
            <CommandDefinitions>
              <CommandDefinition Id="Mscrm.NewRecordFromGrid">
                <EnableRules><EnableRule Id="Mscrm.Enabled" /></EnableRules>
                <DisplayRules />
                <Actions><JavaScriptFunction FunctionName="XrmCore.Commands.Open.openNewRecord" Library="$webresource:Main_system_library.js" /></Actions>
              </CommandDefinition>
              <CommandDefinition Id="Mscrm.HomepageGrid.DeleteSplitButtonCommand">
                <EnableRules />
                <DisplayRules><DisplayRule Id="Mscrm.CanDeletePrimary" /></DisplayRules>
                <Actions />
              </CommandDefinition>
            </CommandDefinitions>
            <RuleDefinitions>
              <TabDisplayRules />
              <DisplayRules>
                <DisplayRule Id="Mscrm.CanDeletePrimary">
                  <EntityPrivilegeRule PrivilegeType="Delete" PrivilegeDepth="Basic" AppliesTo="PrimaryEntity" />
                </DisplayRule>
              </DisplayRules>
              <EnableRules>
                <EnableRule Id="Mscrm.Enabled"><CrmClientTypeRule Type="Web" /></EnableRule>
              </EnableRules>
            </RuleDefinitions>
          </RibbonDefinition>
        </RibbonDefinitions>
        """;

    public const string ApplicationRibbonXml =
        """
        <RibbonDefinitions>
          <RibbonDefinition>
            <UI><Ribbon><Tabs Id="Mscrm.Tabs"><Tab Id="Mscrm.BasicHomeTab" Sequence="10"><Groups Id="Mscrm.BasicHomeTab.Groups" /></Tab></Tabs></Ribbon></UI>
            <Templates><RibbonTemplates Id="Mscrm.Templates" /></Templates>
            <CommandDefinitions>
              <CommandDefinition Id="Mscrm.OpenRecordItem"><EnableRules /><DisplayRules /><Actions /></CommandDefinition>
            </CommandDefinitions>
            <RuleDefinitions>
              <TabDisplayRules />
              <DisplayRules><DisplayRule Id="Mscrm.HideOnModern"><CommandClientTypeRule Type="Modern" InvertResult="true" /></DisplayRule></DisplayRules>
              <EnableRules><EnableRule Id="Mscrm.IsValidForHierarchyView"><CustomRule FunctionName="x" Library="$webresource:Main_system_library.js" /></EnableRule></EnableRules>
            </RuleDefinitions>
          </RibbonDefinition>
        </RibbonDefinitions>
        """;

    public static byte[] Ribbon(string xml) => Zip(new Dictionary<string, string> { ["RibbonXml.xml"] = xml });

    public static byte[] Zip(IReadOnlyDictionary<string, string> files)
    {
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, content) in files)
            {
                var entry = archive.CreateEntry(name);
                using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(false));
                writer.Write(content);
            }
        }

        return stream.ToArray();
    }

    public static string ReadEntry(byte[] zip, string name)
    {
        using var archive = new ZipArchive(new MemoryStream(zip), ZipArchiveMode.Read);
        using var reader = new StreamReader(archive.GetEntry(name)!.Open());
        return reader.ReadToEnd();
    }

    public static IReadOnlyList<string> EntryNames(byte[] zip)
    {
        using var archive = new ZipArchive(new MemoryStream(zip), ZipArchiveMode.Read);
        return archive.Entries.Select(entry => entry.FullName).ToList();
    }
}
