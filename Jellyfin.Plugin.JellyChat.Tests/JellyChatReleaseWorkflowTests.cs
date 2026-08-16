namespace Jellyfin.Plugin.JellyChat.Tests;

public sealed class JellyChatReleaseWorkflowTests
{
    [Fact]
    public void ReleaseWorkflowBuildsAndPublishesFromManualInputs()
    {
        string workflow = ReadRepositoryFile(".github/workflows/release.yaml");

        Assert.Contains("workflow_dispatch:", workflow, StringComparison.Ordinal);
        Assert.Contains("RELEASE_VERSION_INPUT: ${{ inputs.version }}", workflow, StringComparison.Ordinal);
        Assert.Contains("PRERELEASE_INPUT: ${{ inputs.prerelease }}", workflow, StringComparison.Ordinal);
        Assert.Contains("^([0-9]+\\.[0-9]+\\.[0-9]+)$", workflow, StringComparison.Ordinal);
        Assert.Contains("RELEASE_VERSION=\"${BASH_REMATCH[1]}\"", workflow, StringComparison.Ordinal);
        Assert.Contains("PLUGIN_VERSION=\"${RELEASE_VERSION}.0\"", workflow, StringComparison.Ordinal);
        Assert.Contains("npm ci", workflow, StringComparison.Ordinal);
        Assert.Contains("npm run build", workflow, StringComparison.Ordinal);
        Assert.Contains("dotnet test", workflow, StringComparison.Ordinal);
        Assert.Contains("dotnet publish", workflow, StringComparison.Ordinal);
        Assert.Contains("zip -q -r", workflow, StringComparison.Ordinal);
        Assert.Contains("gh release create", workflow, StringComparison.Ordinal);
        Assert.Contains("--draft", workflow, StringComparison.Ordinal);
        Assert.Contains("gh release edit \"${TAG_NAME}\" --draft=false", workflow, StringComparison.Ordinal);
        Assert.Contains("version: pluginVersion", workflow, StringComparison.Ordinal);
        Assert.Contains("Jellyfin.Plugin.JellyChat_${releaseVersion}.zip", workflow, StringComparison.Ordinal);
        Assert.Contains("version: \\\"${PLUGIN_VERSION}\\\"", workflow, StringComparison.Ordinal);
        Assert.Contains("fs.readFileSync('build.yaml', 'utf8')", workflow, StringComparison.Ordinal);
        Assert.Contains("const targetAbi = targetAbiMatch[1]", workflow, StringComparison.Ordinal);
        Assert.Contains("targetAbi,", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("targetAbi: '10.11.0.0'", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("steps.version.outputs.version", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("github.event.release", workflow, StringComparison.Ordinal);

        int draftRelease = workflow.IndexOf("- name: Create draft release", StringComparison.Ordinal);
        int manifestPullRequest = workflow.IndexOf("- name: Create manifest update pull request", StringComparison.Ordinal);
        int publishRelease = workflow.IndexOf("- name: Publish release", StringComparison.Ordinal);
        Assert.True(draftRelease >= 0 && draftRelease < manifestPullRequest && manifestPullRequest < publishRelease);
    }

    [Fact]
    public void BuildMetadataTargetsJellyfin12()
    {
        string buildMetadata = ReadRepositoryFile("build.yaml");
        string directoryBuildProps = ReadRepositoryFile("Directory.Build.props");
        string pluginVersion = buildMetadata
            .Split('\n')
            .Single(line => line.StartsWith("version: ", StringComparison.Ordinal))
            .Split(':', 2)[1]
            .Trim()
            .Trim('"');

        Assert.Contains($"<Version>{pluginVersion}</Version>", directoryBuildProps, StringComparison.Ordinal);
        Assert.Contains("targetAbi: \"12.0.0.0\"", buildMetadata, StringComparison.Ordinal);
        Assert.Contains("framework: \"net10.0\"", buildMetadata, StringComparison.Ordinal);
    }

    [Fact]
    public void Jellyfin12HeaderTriggerUsesStableSyncPlayHook()
    {
        string triggerSource = ReadRepositoryFile("web-src/src/runtime/trigger.ts");

        Assert.Contains("header div:has(> button[aria-label=\"SyncPlay\"])", triggerSource, StringComparison.Ordinal);
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
