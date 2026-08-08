using System.Text;
using Jellyfin.Plugin.JellyChat.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;

namespace Jellyfin.Plugin.JellyChat.Tests;

public sealed class JellyChatWebInjectionMiddlewareTests
{
    [Fact]
    public async Task InvokeAsyncInjectsStylesheetsInOrderBeforeScript()
    {
        var body = new MemoryStream();
        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Get;
        context.Request.Path = "/web/index.html";
        context.Response.Body = body;

        var middleware = new JellyChatWebInjectionMiddleware(
            async httpContext =>
            {
                httpContext.Response.ContentType = "text/html; charset=utf-8";
                await httpContext.Response.WriteAsync("<!DOCTYPE html><html><head><link rel=\"stylesheet\" href=\"/JellyChat/Assets/custom.css?v=stale\" data-jellychat-custom=\"true\"></head><body></body></html>");
            },
            new JellyChatAssetProvider(),
            NullLogger<JellyChatWebInjectionMiddleware>.Instance);

        await middleware.InvokeAsync(context);
        body.Position = 0;
        string html = await new StreamReader(body, Encoding.UTF8).ReadToEndAsync(TestContext.Current.CancellationToken);

        int baseStylesheet = html.IndexOf("jellychat.css", StringComparison.Ordinal);
        int appearanceStylesheet = html.IndexOf("appearance.css", StringComparison.Ordinal);
        int customStylesheet = html.IndexOf("custom.css", StringComparison.Ordinal);
        int script = html.IndexOf("jellychat.js", StringComparison.Ordinal);
        Assert.True(baseStylesheet >= 0);
        Assert.True(appearanceStylesheet > baseStylesheet);
        Assert.True(customStylesheet > appearanceStylesheet);
        Assert.True(script > customStylesheet);
        Assert.Equal(customStylesheet, html.LastIndexOf("custom.css", StringComparison.Ordinal));
        Assert.DoesNotContain("custom.css?v=stale", html, StringComparison.Ordinal);
        Assert.Contains("data-jellychat-custom=\"true\" disabled", html, StringComparison.Ordinal);
    }
}
