using Jellyfin.Plugin.JellyChat.Api;
using Jellyfin.Plugin.JellyChat.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;

namespace Jellyfin.Plugin.JellyChat.Tests;

public sealed class JellyChatAssetsControllerTests
{
    [Theory]
    [InlineData(true, "public, max-age=31536000, immutable")]
    [InlineData(false, "no-cache")]
    public void GetAssetServesCustomCssWithExpectedCaching(bool currentVersion, string expectedCacheControl)
    {
        var assetProvider = new JellyChatAssetProvider();
        var controller = new JellyChatAssetsController(
            assetProvider,
            NullLogger<JellyChatAssetsController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };

        string version = currentVersion ? assetProvider.GetCustomCssAsset().Version : "stale";
        FileContentResult result = Assert.IsType<FileContentResult>(controller.GetAsset("custom.css", version));

        Assert.Equal("text/css; charset=utf-8", result.ContentType);
        Assert.Equal("nosniff", controller.Response.Headers.XContentTypeOptions);
        Assert.Equal(expectedCacheControl, controller.Response.Headers.CacheControl);
    }
}
