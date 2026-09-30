using Microsoft.Xrm.Sdk;

namespace PowerTools.API.Tools.WorkflowActivities;

public sealed record WorkflowActivitiesResult<T>(T? Value, WorkflowActivitiesProblem? Problem)
{
    public static WorkflowActivitiesResult<T> Ok(T value) => new(value, null);

    public static WorkflowActivitiesResult<T> Fail(WorkflowActivitiesProblem problem) => new(default, problem);
}

public sealed class WorkflowActivitiesService
{
    private readonly IWorkflowActivitiesClient client;
    private readonly int maxProcessPages;

    public WorkflowActivitiesService(
        IWorkflowActivitiesClient client,
        int maxProcessPages = WorkflowActivitiesLimits.MaxProcessPages)
    {
        if (maxProcessPages < 1)
            throw new ArgumentOutOfRangeException(nameof(maxProcessPages));

        this.client = client;
        this.maxProcessPages = maxProcessPages;
    }

    public async Task<WorkflowActivitiesResult<WorkflowActivitiesResponse>> GetActivitiesAsync(
        CancellationToken cancellationToken)
    {
        try
        {
            var query = WorkflowActivitiesQueries.Activities(1, null, null);
            var rows = new List<Entity>();
            while (true)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var page = await client.RetrieveMultipleAsync(query, cancellationToken);
                rows.AddRange(page.Entities);
                if (!page.MoreRecords)
                    break;

                query.PageInfo.PageNumber++;
                query.PageInfo.PagingCookie = page.PagingCookie;
            }

            return WorkflowActivitiesResult<WorkflowActivitiesResponse>.Ok(
                new WorkflowActivitiesResponse(WorkflowActivitiesMapper.Assemblies(rows)));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return WorkflowActivitiesResult<WorkflowActivitiesResponse>.Fail(WorkflowActivitiesFaults.From(ex));
        }
    }

    public async Task<WorkflowActivitiesResult<ActivityProcessesResponse>> GetProcessesAsync(
        string pluginTypeId,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!Guid.TryParse(pluginTypeId, out var id) || id == Guid.Empty)
                return WorkflowActivitiesResult<ActivityProcessesResponse>.Fail(WorkflowActivitiesFaults.NotFound());

            var activityQuery = WorkflowActivitiesQueries.Activities(1, null, id);
            var activityPage = await client.RetrieveMultipleAsync(activityQuery, cancellationToken);
            var activity = activityPage.Entities.FirstOrDefault();
            if (activity is null)
                return WorkflowActivitiesResult<ActivityProcessesResponse>.Fail(WorkflowActivitiesFaults.NotFound());

            var activityName = activity.Contains("name") && activity["name"] is string name ? name : "";
            var typeName = activity.Contains("typename") && activity["typename"] is string type ? type : "";
            if (WorkflowActivityMatching.ClrTypeIdentity(typeName).Length == 0)
            {
                return WorkflowActivitiesResult<ActivityProcessesResponse>.Ok(
                    new ActivityProcessesResponse(activityName, false, []));
            }

            var processes = await ReadMatchingProcessesAsync(typeName, cancellationToken);
            return WorkflowActivitiesResult<ActivityProcessesResponse>.Ok(
                new ActivityProcessesResponse(activityName, processes.Truncated, processes.Processes));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return WorkflowActivitiesResult<ActivityProcessesResponse>.Fail(WorkflowActivitiesFaults.From(ex));
        }
    }

    private async Task<(bool Truncated, IReadOnlyList<ProcessDto> Processes)> ReadMatchingProcessesAsync(
        string typeName,
        CancellationToken cancellationToken)
    {
        var query = WorkflowActivitiesQueries.Processes(1, null);
        var matches = new List<ProcessDto>();
        for (var pageIndex = 0; pageIndex < maxProcessPages; pageIndex++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var page = await client.RetrieveMultipleAsync(query, cancellationToken);
            foreach (var entity in page.Entities)
            {
                var xaml = entity.Contains("xaml") && entity["xaml"] is string text ? text : null;
                if (!WorkflowActivityMatching.XamlContainsType(xaml, typeName))
                    continue;

                matches.Add(WorkflowActivitiesMapper.Process(entity));
            }

            if (!page.MoreRecords)
                return (false, matches);

            query.PageInfo.PageNumber++;
            query.PageInfo.PagingCookie = page.PagingCookie;
        }

        return (true, matches);
    }
}
