namespace PowerTools.API.Tools.Agent.Kernel;

/// <summary>
/// The solution a change goes into, and the publisher that decides the prefix and the option value prefix.
/// Every kernel request carries <see cref="UniqueName"/> as SolutionUniqueName.
/// </summary>
public sealed record SolutionContext(string UniqueName, PublisherInfo Publisher)
{
    public string Prefix => Publisher.Prefix;

    public int OptionValuePrefix => Publisher.OptionValuePrefix;

    /// <summary>Resolves an unmanaged solution and its publisher, or throws the problem the call answers with.</summary>
    public static async Task<SolutionContext> ResolveAsync(IAgentClient client, string solution, CancellationToken ct)
    {
        var resolved = await AgentPublishers.ResolveAsync(client, solution, null, ct);
        if (resolved.Problem is not null) throw new AgentProblemException(resolved.Problem);
        return new SolutionContext(solution.Trim(), resolved.Value!);
    }

    /// <summary>A schema name with the publisher prefix, or the problem that says what to change.</summary>
    public AgentProblem? CheckSchemaName(string schemaName) => AgentPublishers.CheckSchemaName(schemaName, Publisher);
}
