<script lang="ts">
import { t } from "./界面翻译";
import SourceBadge from "./SourceBadge.svelte";
export let obj: any;
export let buildNumber: string | undefined;
const _context = "View/Edit on GitHub";

const sourceLabel = obj.__source_name ?? obj.__source_id ?? "CDDA-Breeze";
const sourceFilename = obj.__filename ?? "";
const sourceUrl = obj.__source_url ?? "";
</script>

<pre>{JSON.stringify(
    obj,
    (key, value) => (key.startsWith("__") ? undefined : value),
    2,
  )}</pre>
{#if sourceFilename || sourceLabel}
  <p class="source">
    {t("来源:")} <SourceBadge item={obj} />
    {#if sourceFilename}<code>{sourceFilename}</code>{/if}
    {#if buildNumber}<small>{t("数据版本")}：{buildNumber}</small>{/if}
    {#if sourceUrl}
      <a href={sourceUrl} target="_blank" rel="noreferrer">
        {t("查看仓库来源", { _context })}
      </a>
    {/if}
  </p>
{/if}

<style>
.source {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: baseline;
}

.source code {
  overflow-wrap: anywhere;
}
</style>
