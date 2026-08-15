.status == "SUCCESS" and
.projectId == $project and
(if $mode == "git" then
  .sourceProvenance.resolvedGitSource.revision == $sha and
  .sourceProvenance.resolvedGitSource.url == $url and
  (.sourceProvenance.resolvedStorageSource == null)
else
  (.sourceProvenance.resolvedGitSource == null) and
  ($storage_uri | capture("^gs://(?<bucket>[^/]+)/(?<object>.+)$")) as $submitted |
  .sourceProvenance.resolvedStorageSource as $resolved |
  ($resolved.bucket == $submitted.bucket) and
  ($resolved.object | type == "string" and length > 0) and
  ($resolved.generation | type == "string" and test("^[1-9][0-9]*$")) and
  ("gs://" + $resolved.bucket + "/" + $resolved.object + "#" + $resolved.generation) as $resolved_key |
  ([.sourceProvenance.fileHashes[$resolved_key].fileHash[]? |
    select(.type == "SHA256" or .type == 2) | .value] == [$source_hash])
end) and
.substitutions._SOURCE_SHA == $sha and
.substitutions._SOURCE_CONTEXT_SHA256 == $context and
.substitutions._IMAGE_PREFIX == $prefix and
.substitutions._IMAGE_TAG == $tag and
([.results.images[]?.name] | sort) ==
  (["proxus-server", "proxus-admin-server", "proxus-web", "proxus-admin-web"] |
    map($prefix + "/" + . + ":" + $tag) | sort) and
all(.results.images[]?;
  (.digest | type == "string" and test("^sha256:[a-f0-9]{64}$")))
