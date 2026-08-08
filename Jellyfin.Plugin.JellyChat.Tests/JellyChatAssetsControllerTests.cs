using Jellyfin.Plugin.JellyChat.Api;
using Jellyfin.Plugin.JellyChat.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;

namespace Jellyfin.Plugin.JellyChat.Tests;

public sealed class JellyChatAssetsControllerTests
{
    [Fact]
    public void GetAssetServesCustomCss()
    {
        var controller = new JellyChatAssetsController(
            new JellyChatAssetProvider(),
            NullLogger<JellyChatAssetsController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };

        FileContentResult result = Assert.IsType<FileContentResult>(controller.GetAsset("custom.css", null));

        Assert.Equal("text/css; charset=utf-8", result.ContentType);
        Assert.Equal("nosniff", controller.Response.Headers.XContentTypeOptions);
    }
}
