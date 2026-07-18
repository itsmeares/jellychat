namespace Jellyfin.Plugin.JellyChat.Tests;

public sealed class JellyChatReleaseWorkflowTests
{
    [Fact]
    public void ReleaseWorkflowSeparatesReleaseAndPluginVersions()
    {
        string workflow = ReadRepositoryFile(".github/workflows/release.yaml");

        Assert.Contains("^v([0-9]+\\.[0-9]+\\.[0-9]+)$", workflow, StringComparison.Ordinal);
        Assert.Contains("RELEASE_VERSION=\"${BASH_REMATCH[1]}\"", workflow, StringComparison.Ordinal);
        Assert.Contains("PLUGIN_VERSION=\"${RELEASE_VERSION}.0\"", workflow, StringComparison.Ordinal);
        Assert.Contains("release_version=${RELEASE_VERSION}", workflow, StringComparison.Ordinal);
        Assert.Contains("plugin_version=${PLUGIN_VERSION}", workflow, StringComparison.Ordinal);
        Assert.Contains("Jellyfin.Plugin.JellyChat_${{ steps.version.outputs.release_version }}.zip", workflow, StringComparison.Ordinal);
        Assert.Contains("version: pluginVersion", workflow, StringComparison.Ordinal);
        Assert.Contains("Jellyfin.Plugin.JellyChat_${releaseVersion}.zip", workflow, StringComparison.Ordinal);
        Assert.Contains("version: \\\"${PLUGIN_VERSION}\\\"", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("steps.version.outputs.version", workflow, StringComparison.Ordinal);
    }

    private static string ReadRepositoryFile(string relativePath)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            string candidate = Path.Combine(directory.FullName, relativePath.Replace('/', Path.DirectorySeparatorChar));
            if (File.Exists(candidate))
            {
                return File.ReadAllText(candidate);
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException($"Could not find repository file {relativePath}.");
    }
}
