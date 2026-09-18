using Microsoft.Xrm.Sdk;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Gateway;
using PowerTools.API.Tools.PluginRegistration.Queries;

namespace PowerTools.API.Tools.PluginRegistration.Services;

public sealed class StepOptionsService(IPluginRegistrationGateway gateway)
{
    public async Task<StepOptionsDto> GetAsync(CancellationToken ct)
    {
        var messagesTask = gateway.RetrieveAllAsync(StepOptionQueries.Messages(), ct);
        var filtersTask = gateway.RetrieveAllAsync(StepOptionQueries.Filters(), ct);
        var usersTask = gateway.RetrieveAllAsync(StepOptionQueries.Users(), ct);
        await Task.WhenAll(messagesTask, filtersTask, usersTask);

        return new StepOptionsDto(
            messagesTask.Result.Select(entity => new MessageOptionDto(
                entity.Id,
                entity.GetAttributeValue<string>("name") ?? string.Empty)).ToList(),
            filtersTask.Result.Select(entity => new FilterOptionDto(
                entity.Id,
                entity.GetAttributeValue<EntityReference>("sdkmessageid")?.Id ?? Guid.Empty,
                entity.GetAttributeValue<string>("primaryobjecttypecode"),
                entity.GetAttributeValue<string>("secondaryobjecttypecode"),
                entity.GetAttributeValue<OptionSetValue>("availability")?.Value ?? 0)).ToList(),
            usersTask.Result.Select(entity => new UserOptionDto(
                entity.Id,
                entity.GetAttributeValue<string>("fullname") ?? string.Empty)).ToList());
    }
}
