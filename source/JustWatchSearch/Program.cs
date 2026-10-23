using JustWatchSearch;
using JustWatchSearch.Services;
using JustWatchSearch.Services.JustWatch;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");
builder.Services.AddBlazorBootstrap();

builder.Services.AddSingleton<ICurrencyConverter, CurrencyConverter>();
builder.Services.AddSingleton<IJustwatchApiService>(sp => 
{
    var logger = sp.GetRequiredService<ILogger<JustwatchApiService>>();
    var currencyConverter = sp.GetRequiredService<ICurrencyConverter>();
    
    // Build the proxy address relative to wherever the app is hosted, so the same
    // publish output works on Cloudflare, localhost, or a custom domain with no
    // rebuild. On Cloudflare this is same-origin, which is why the browser never
    // has to preflight these calls.
    //
    // Host-only form ("/proxy/apis.justwatch.com") rather than the old
    // "/proxy/https://apis.justwatch.com": a scheme inside a URL path gets its
    // double slash collapsed by some servers and CDNs, which is what forced the
    // regex repair in the previous Node proxy. The Worker still accepts the old
    // form if you ever need it.
    var baseAddress = builder.HostEnvironment.BaseAddress.TrimEnd('/') + "/proxy/apis.justwatch.com";
    
    return new JustwatchApiService(logger, currencyConverter, baseAddress);
});

builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
await builder.Build().RunAsync();
