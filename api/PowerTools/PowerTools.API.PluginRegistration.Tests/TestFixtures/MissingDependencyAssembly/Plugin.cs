using System;
using FixtureDependency;
using Microsoft.Xrm.Sdk;

namespace MissingDependencyAssembly;

public sealed class Plugin : IPlugin
{
    public DependencyType Dependency { get; set; }

    public void Execute(IServiceProvider serviceProvider)
    {
    }
}
