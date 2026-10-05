namespace PowerTools.API.Tools.AttributeExplorer;

public sealed class AttributeExplorerService(IAttributeExplorerClient client)
{
    public async Task<AttributeExplorerResult<TablesResponse>> GetTablesAsync(CancellationToken cancellationToken)
    {
        try
        {
            var tables = await client.RetrieveAllTablesAsync(cancellationToken);
            return AttributeExplorerResult<TablesResponse>.Ok(
                new TablesResponse(AttributeExplorerMapper.Tables(tables)));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return AttributeExplorerResult<TablesResponse>.Fail(AttributeExplorerFaults.From(ex));
        }
    }

    public async Task<AttributeExplorerResult<TableAttributesResponse>> GetAttributesAsync(
        string logicalName,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(logicalName))
        {
            return AttributeExplorerResult<TableAttributesResponse>.Fail(AttributeExplorerFaults.TableNotFound());
        }

        try
        {
            var table = await client.RetrieveTableAsync(logicalName.Trim(), cancellationToken);
            return AttributeExplorerResult<TableAttributesResponse>.Ok(
                new TableAttributesResponse(
                    AttributeExplorerMapper.Table(table),
                    AttributeExplorerMapper.Attributes(table)));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return AttributeExplorerResult<TableAttributesResponse>.Fail(
                AttributeExplorerFaults.IsTableNotFound(ex)
                    ? AttributeExplorerFaults.TableNotFound()
                    : AttributeExplorerFaults.From(ex));
        }
    }
}
