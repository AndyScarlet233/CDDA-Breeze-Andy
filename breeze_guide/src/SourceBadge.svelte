<script lang="ts">
import { cleanDisplayName } from "./界面名称";

export let item: any = undefined;
export let compact = false;

$: sourceId = String(item?.__source_id ?? "dda");
$: sourceType = String(item?.__source_type ?? "");
$: visible = sourceId !== "dda" && sourceType !== "本体";
$: sourceName = cleanDisplayName(item?.__source_name || sourceId);
$: hue = [...sourceId].reduce(
  (sum, char) => sum + char.charCodeAt(0) * 17,
  0,
) % 360;
</script>

{#if visible}
  <span
    class:compact
    class="source-badge"
    style={`--source-hue: ${hue}`}
    title={`来自模组：${sourceName}`}>
    {sourceName}
  </span>
{/if}

<style>
.source-badge {
  --source-hue: 128;
  display: inline-flex;
  align-items: center;
  max-width: min(26rem, 52vw);
  padding: 0.22rem 0.58rem;
  border: 1px solid hsl(var(--source-hue) 68% 55% / 0.72);
  border-radius: 999px;
  background: hsl(var(--source-hue) 45% 19% / 0.9);
  color: hsl(var(--source-hue) 88% 78%);
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.source-badge.compact {
  margin-left: 0.45rem;
  padding: 0.1rem 0.42rem;
  font-size: 0.68rem;
  font-weight: 600;
}
</style>
