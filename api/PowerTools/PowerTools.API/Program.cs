using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Services;

var builder = WebApplication.CreateBuilder(args);

// ── OpenAPI ──────────────────────────────────────────────────────────────────
builder.Services.AddOpenApi();

// ── CORS – allow Electron renderer / local dev calls ─────────────────────────
builder.Services.AddCors(opt =>
    opt.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

// ── JWT Bearer – validates Microsoft-issued tokens (any AAD tenant) ──────────
//    The token audience is the D365 environment URL (dynamic), so we skip
//    audience validation here; Dataverse itself enforces it.
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // "common" endpoint covers tokens from any AAD tenant
        options.Authority = "https://login.microsoftonline.com/common/v2.0";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateAudience = false,
            ValidateIssuer   = true,
            // Accept any Microsoft STS issuer (multi-tenant)
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

// ── Dataverse factory – creates ServiceClient per-request using user token ────
builder.Services.AddScoped<DataverseClientFactory>();

var app = builder.Build();

// ── Middleware pipeline ───────────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
    app.MapOpenApi();

app.UseCors();
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

// ── Helper: extract Bearer token + environment URL from the request ───────────
static (string? token, string? envUrl) ExtractContext(HttpContext ctx)
{
    var auth   = ctx.Request.Headers.Authorization.FirstOrDefault();
    var token  = auth?.StartsWith("Bearer ") == true ? auth["Bearer ".Length..] : null;
    var envUrl = ctx.Request.Headers["X-Environment-Url"].FirstOrDefault();
    return (token, envUrl);
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

// Health-check / connection test
app.MapGet("/api/connect", (HttpContext ctx, DataverseClientFactory factory) =>
{
    var (token, envUrl) = ExtractContext(ctx);
    if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(envUrl))
        return Results.BadRequest("Missing Authorization header or X-Environment-Url header.");

    return Results.Ok(new { connected = true, environment = envUrl });
})
.WithName("Connect")
.RequireAuthorization();

// Retrieve top 10 accounts
app.MapGet("/api/accounts", async (HttpContext ctx, DataverseClientFactory factory) =>
{
    var (token, envUrl) = ExtractContext(ctx);
    if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(envUrl))
        return Results.BadRequest("Missing Authorization header or X-Environment-Url header.");

    var svc   = factory.Create(token, envUrl);
    var query = new QueryExpression("account")
    {
        ColumnSet = new ColumnSet("name", "emailaddress1"),
        TopCount  = 10
    };

    var results  = await svc.RetrieveMultipleAsync(query);
    var accounts = results.Entities.Select(e => new
    {
        Id    = e.Id,
        Name  = e.GetAttributeValue<string>("name"),
        Email = e.GetAttributeValue<string>("emailaddress1")
    });

    return Results.Ok(accounts);
})
.WithName("GetAccounts")
.RequireAuthorization();

app.Run();