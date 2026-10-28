using Microsoft.Xrm.Sdk;

namespace PowerTools.API.Tools.DataMigration;

/// <summary>
/// What the user asked the migration to do. Records are matched by id, as in
/// XrmToolBox Data Transporter.
/// </summary>
/// <param name="ConfirmedDeleteCount">
/// How many target records the user agreed to delete. The run deletes nothing
/// when it finds more than this.
/// </param>
public record MigrationOptions(bool Create, bool Update, bool Delete, int? ConfirmedDeleteCount = null);

public enum RecordAction { Create, Update, Skip }

/// <summary>Decisions the preview and the migration runner share.</summary>
public static class MigrationPlan
{
    public const string StateAttribute = "statecode";
    public const string StatusAttribute = "statuscode";

    // Dataverse creates records in the first state, which is 0 (Active, Open, Draft).
    private const int InitialState = 0;

    /// <summary>
    /// Existing records are updated and missing records are created. A record the
    /// options do not cover is skipped instead of sent and failed.
    /// </summary>
    public static RecordAction Decide(MigrationOptions options, bool existsInTarget) =>
        existsInTarget
            ? options.Update ? RecordAction.Update : RecordAction.Skip
            : options.Create ? RecordAction.Create : RecordAction.Skip;

    /// <summary>
    /// The source columns to read. The state is read with the status reason, so a
    /// new record can be created first and moved to that state afterwards.
    /// </summary>
    public static List<string> SourceColumns(IReadOnlyCollection<string> attributes)
    {
        var columns = attributes.ToList();
        if (columns.Contains(StatusAttribute) && !columns.Contains(StateAttribute))
            columns.Add(StateAttribute);
        return columns;
    }

    /// <summary>
    /// Dataverse rejects a create that carries a status reason of another state
    /// than the first one, such as Inactive. For those records the state and status
    /// reason are removed from <paramref name="create"/> and returned as a separate
    /// update to send after it. Returns null when the record can be created as is.
    /// </summary>
    public static Entity? SplitStateChange(Entity create, Entity source)
    {
        var state = source.GetAttributeValue<OptionSetValue>(StateAttribute);
        if (state is null || state.Value == InitialState) return null;

        var change = new Entity(create.LogicalName, source.Id)
        {
            [StateAttribute] = state
        };
        var status = source.GetAttributeValue<OptionSetValue>(StatusAttribute);
        if (create.Contains(StatusAttribute) && status is not null)
            change[StatusAttribute] = status;

        create.Attributes.Remove(StateAttribute);
        create.Attributes.Remove(StatusAttribute);
        return change;
    }

    /// <summary>
    /// Why the delete step must not run, or null when it may. Deleting is the one
    /// step that cannot be undone, so the run stops rather than guessing.
    /// </summary>
    public static string? DeleteBlockedReason(MigrationOptions options, int sourceCount, int toDelete)
    {
        if (!options.Delete || toDelete == 0) return null;
        if (options.ConfirmedDeleteCount is not int confirmed)
            return "Delete was not confirmed, so no target records were deleted.";
        if (sourceCount == 0)
            return $"No source records match, so the {toDelete} matching target records were not deleted. " +
                   "Check the source connection and filter.";
        if (toDelete > confirmed)
            return $"{toDelete} target records would be deleted, more than the {confirmed} you confirmed, " +
                   "so none were deleted. Open Preview to see the current list, then start again.";
        return null;
    }
}
