using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Tools.Connection;
using PowerTools.API.Tools.DataMigration;

var builder = WebApplication.CreateBuilder(args);

// ── OpenAPI ──────────────────────────────────────────────────────────────────
builder.Services.AddOpenApi();

// ── CORS – allow Electron renderer / local dev calls ─────────────────────────
builder.Services.AddCors(opt =>
    opt.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

// ── JWT Bearer – validates Microsoft-issued tokens (any AAD tenant) ──────────
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://login.microsoftonline.com/common/v2.0";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateAudience = false,
            ValidateIssuer   = true,
            IssuerValidator  = (issuer, _, _) =>
            {
                if (issuer.StartsWith("https://sts.windows.net/") ||
                    issuer.StartsWith("https://login.microsoftonline.com/"))
                    return issuer;
                throw new SecurityTokenInvalidIssuerException($"Unexpected issuer: {issuer}");
            }
        };
    });

builder.Services.AddAuthorization();

// ── App services ─────────────────────────────────────────────────────────────
builder.Services.AddSingleton<DataverseClientFactory>();
builder.Services.AddScoped<DataverseContextFilter>();
builder.Services.AddScoped<DataverseTargetContextFilter>();
builder.Services.AddSingleton<IMigrationJobStore, InMemoryMigrationJobStore>();
builder.Services.AddHostedService<MigrationJobRunner>();

var app = builder.Build();

// ── Middleware pipeline ──────────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
    app.MapOpenApi();

app.UseCors();
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

// ── Endpoint groups — one per tool ───────────────────────────────────────────
app.MapConnectionEndpoints();
app.MapDataMigrationEndpoints();
app.MapMetadataEndpoints();
app.MapPreviewEndpoints();
app.MapMigrationEndpoints();

app.Run();
