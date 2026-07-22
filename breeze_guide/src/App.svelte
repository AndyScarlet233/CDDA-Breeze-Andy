<script lang="ts">
import Thing from "./Thing.svelte";
import {
  CddaData,
  data,
  loadProgress,
  localeVersion,
  mapType,
  singularName,
  modCatalog,
  enabledModIds,
  dataLoadError,
} from "./data";
import SearchResults from "./SearchResults.svelte";
import Catalog from "./Catalog.svelte";
import dontPanic from "./assets/dont_panic.png";
import { t } from "@transifex/native";
import type { SupportedTypeMapped, SupportedTypesWithMapped } from "./types";
import throttle from "lodash/throttle";
import debounce from "lodash/debounce";
import { onDestroy } from "svelte";
import { guideTypeName } from "./界面名称";

let item: { type: string; id: string } | null = null;
let search: string = "";
let renderedSearch = search;
const updateRenderedSearch = debounce((value: string) => {
  renderedSearch = value;
}, 150);

function renderSearchNow() {
  updateRenderedSearch.cancel();
  renderedSearch = search;
}

$: if (search !== renderedSearch) {
  if (search) updateRenderedSearch(search);
  else renderSearchNow();
}

onDestroy(updateRenderedSearch.cancel);

function readSavedModIds(): string[] | undefined {
  try {
    const saved = localStorage.getItem("breeze-guide-enabled-mods-v3");
    if (saved === null) return undefined;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.map(String) : undefined;
  } catch {
    return undefined;
  }
}

const savedModIds = readSavedModIds() ?? [];
let pendingModIds = [...savedModIds];
let modSelectionInitialized = false;

data.load(savedModIds);

$: if (!modSelectionInitialized && $modCatalog.length) {
  pendingModIds = [...$enabledModIds];
  modSelectionInitialized = true;
}

function isPendingMod(id: string): boolean {
  return pendingModIds.includes(id);
}

function setPendingMod(id: string, checked: boolean) {
  pendingModIds = checked
    ? [...new Set([...pendingModIds, id])]
    : pendingModIds.filter((candidate) => candidate !== id);
}

async function applyModSelection() {
  try {
    localStorage.setItem(
      "breeze-guide-enabled-mods-v3",
      JSON.stringify(pendingModIds),
    );
  } catch {
    // 隐私模式可能禁用本地存储，不影响当前会话使用。
  }
  await data.load(pendingModIds);
  pendingModIds = [...$enabledModIds];
}


function selectAllMods() {
  pendingModIds = $modCatalog.map((mod) => mod.id);
}

function selectNoMods() {
  pendingModIds = [];
}

function submitSearch(event: SubmitEvent) {
  event.preventDefault();
  clearItem();
  renderSearchNow();
}

async function restoreDefaultMods() {
  try {
    localStorage.removeItem("breeze-guide-enabled-mods-v3");
  } catch {
    // 同上。
  }
  await data.load([]);
  pendingModIds = [...$enabledModIds];
}

function decodeQueryParam(p: string) {
  return decodeURIComponent(p.replace(/\+/g, " "));
}

function load() {
  const path = location.pathname.slice(import.meta.env.BASE_URL.length - 1);
  let m: RegExpExecArray | null;
  if ((m = /^\/([^\/]+)(?:\/(.+))?$/.exec(path))) {
    const [, type, id] = m;
    if (type === "search") {
      item = null;
      search = decodeQueryParam(id ?? "");
      renderSearchNow();
    } else {
      item = { type, id: id ? decodeURIComponent(id) : "" };
    }

    window.scrollTo(0, 0);
  } else {
    item = null;
    search = "";
    renderSearchNow();
  }
}

$: if (item && item.id && $data && $data.byIdMaybe(item.type as any, item.id)) {
  const it = $data.byId(item.type as any, item.id);
  document.title = `${singularName(
    it,
  )} - CDDA-Breeze 微风指南`;
} else if (item && !item.id && item.type) {
  document.title = `${guideTypeName(item.type)} - CDDA-Breeze 微风指南`;
} else {
  document.title = "CDDA-Breeze 微风指南";
}

load();

// Throttle replaceState to avoid browser warnings.
// |throttle| isn't defined when running tests for some reason.
const replaceState = throttle
  ? throttle(history.replaceState.bind(history), 100, {
      trailing: true,
    })
  : history.replaceState.bind(history);

const clearItem = () => {
  if (item)
    history.pushState(
      null,
      "",
      import.meta.env.BASE_URL +
        (search ? "search/" + encodeURIComponent(search) : "") +
        location.search,
    );
  else
    replaceState(
      null,
      "",
      import.meta.env.BASE_URL +
        (search ? "search/" + encodeURIComponent(search) : "") +
        location.search,
    );
  item = null;
};

function maybeNavigate(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const anchor = target?.closest("a") as HTMLAnchorElement | null;
  if (anchor && anchor.href) {
    const { origin, pathname } = new URL(anchor.href);
    if (
      origin === location.origin &&
      pathname.startsWith(import.meta.env.BASE_URL)
    ) {
      event.preventDefault();
      history.pushState(null, "", pathname + location.search);
      load();
    }
  }
}

window.addEventListener("popstate", () => {
  load();
});

let deferredPrompt: any;
window.addEventListener("beforeinstallprompt", (e) => {
  deferredPrompt = e;
});

function maybeFocusSearch(e: KeyboardEvent) {
  if (e.key === "/" && document.activeElement?.id !== "search") {
    document.getElementById("search")?.focus();
    e.preventDefault();
  }
}

const randomableItemTypes = new Set<keyof SupportedTypesWithMapped>([
  "item",
  "monster",
  "furniture",
  "terrain",
  "vehicle_part",
  "tool_quality",
  "mutation",
  "martial_art",
  "json_flag",
  "achievement",
  "conduct",
  "proficiency",
]);
async function getRandomPage() {
  const d = await new Promise<CddaData>((resolve) => {
    const unsubscribe = data.subscribe((v) => {
      if (v) {
        resolve(v);
        setTimeout(() => unsubscribe());
      }
    });
  });
  const items = d
    .all()
    .filter(
      (x) => "id" in x && randomableItemTypes.has(mapType(x.type)),
    ) as (SupportedTypeMapped & { id: string })[];
  return items[(Math.random() * items.length) | 0];
}

let randomPage: string | null = null;
function newRandomPage() {
  getRandomPage().then((r) => {
    randomPage = `${import.meta.env.BASE_URL}${mapType(r.type)}/${r.id}${
      location.search
    }`;
  });
}
newRandomPage();
</script>

<svelte:window on:click={maybeNavigate} on:keydown={maybeFocusSearch} />

<header>
  <nav>
    <div class="title">
      <strong>
        <a
          href={import.meta.env.BASE_URL + location.search}
          on:click={() => (search = "")}
          ><span class="wide">CDDA-Breeze 微风指南</span><span
            class="narrow">微风指南</span
          ></a>
      </strong>
    </div>
    <form class="search" on:submit={submitSearch}>
      <input
        style="margin: 0; width: 100%"
        placeholder="搜索……"
        aria-label="搜索指南"
        type="search"
        bind:value={search}
        on:input={clearItem}
        id="search" />
    </form>
  </nav>
</header>
<main>
  {#if $dataLoadError}
    <section class="load-error">
      <h2>{t("指南数据加载失败")}</h2>
      <p>{$dataLoadError}</p>
      <button type="button" on:click={() => data.load(pendingModIds)}>
        {t("重新加载")}
      </button>
    </section>
  {/if}
  {#key $localeVersion}
  {#if item}
    {#if $data}
      {#key `${item.type}/${item.id}/${$data.build_number}`}
        {#if item.id}
          <Thing {item} data={$data} />
        {:else}
          <Catalog type={item.type} data={$data} />
        {/if}
      {/key}
    {:else}
      <span style="color: var(--cata-color-gray)">
        <em>{t("加载中...")}</em>
        {#if $loadProgress && $loadProgress[1] > 1024}
          ({($loadProgress[0] / 1024 / 1024).toFixed(1)}/{(
            $loadProgress[1] /
            1024 /
            1024
          ).toFixed(1)} MB)
        {/if}
      </span>
    {/if}
  {:else if search}
    {#if $data}
      {#key `${renderedSearch}/${$data.build_number}`}
        <SearchResults data={$data} search={renderedSearch} />
      {/key}
    {:else}
      <span style="color: var(--cata-color-gray)">
        <em>{t("加载中...")}</em>
        {#if $loadProgress && $loadProgress[1] > 1024}
          ({($loadProgress[0] / 1024 / 1024).toFixed(1)}/{(
            $loadProgress[1] /
            1024 /
            1024
          ).toFixed(1)} MB)
        {/if}
      </span>
    {/if}
  {:else}
    <img
      src={dontPanic}
      height="200"
      width="343"
      class="dont-panic"
      alt="大大的友善字体写着不要慌" />
    <p>
      <strong>CDDA-Breeze 微风指南</strong> 是末日回合制生存游戏
      <a href="https://github.com/AndyScarlet233/CDDA-Breeze-Andy" target="_blank" rel="noreferrer">CDDA-Breeze</a>
      的资料指南。你可以搜索游戏中的物品、怪物、家具、地形和其他内容，并直接查看由游戏 JSON 数据整理出的信息。
    </p>
    <p>
      指南会将已经载入的数据保存在浏览器中，并支持离线使用。只要成功访问过一次，之后即使临时断网，也可以继续查看已缓存的内容。
      {#if deferredPrompt}
        <button
          class="disclosure"
          on:click={(event) => {
            event.preventDefault();
            deferredPrompt.prompt();
          }}>安装为应用</button>
      {/if}
    </p>
    <p class="guide-quote">
      比《星际家庭保养指南》更流行，比《失重下可以做的53件事》更畅销，也比某些末日求生手册更容易查到真正有用的东西。
    </p>
    <p>
      本指南由 Andy Scarlet 与 ChatGPT 维护，数据来自 CDDA-Breeze 游戏本体。发现问题时，可以前往
      <a href="https://github.com/AndyScarlet233/CDDA-Breeze-Andy/issues" target="_blank" rel="noreferrer">GitHub 提交问题</a>。
    </p>

    <h2>目录</h2>
    <ul class="catalog-list">
      <li><a href="{import.meta.env.BASE_URL}item{location.search}">物品</a></li>
      <li><a href="{import.meta.env.BASE_URL}monster{location.search}">怪物</a></li>
      <li><a href="{import.meta.env.BASE_URL}furniture{location.search}">家具</a></li>
      <li><a href="{import.meta.env.BASE_URL}terrain{location.search}">地形</a></li>
      <li><a href="{import.meta.env.BASE_URL}vehicle_part{location.search}">载具部件</a></li>
      <li><a href="{import.meta.env.BASE_URL}tool_quality{location.search}">功能</a></li>
      <li><a href="{import.meta.env.BASE_URL}mutation{location.search}">变异</a></li>
      <li><a href="{import.meta.env.BASE_URL}martial_art{location.search}">武术</a></li>
      <li><a href="{import.meta.env.BASE_URL}json_flag{location.search}">标记</a></li>
      <li>
        <a href="{import.meta.env.BASE_URL}achievement{location.search}">成就</a> /
        <a href="{import.meta.env.BASE_URL}conduct{location.search}">守则</a>
      </li>
      <li><a href="{import.meta.env.BASE_URL}proficiency{location.search}">专长</a></li>
    </ul>

    <p>
      或者查看
      <a href={randomPage} on:click={() => setTimeout(newRandomPage)}>随机页面</a>。
    </p>
  {/if}

  {#if $modCatalog.length}
    <details class="mod-options">
      <summary>
        {t("模组数据")}（{$enabledModIds.length}/{$modCatalog.length}）
      </summary>
      <p class="mod-note">
        这里只显示维护者已经审核并发布的模组数据。模组默认不参与检索，勾选后点击“应用选择”才会载入。
      </p>
      <div class="mod-grid">
        {#each $modCatalog as mod (mod.id)}
          <label class:required-mod={mod.required} title={mod.description || mod.id}>
            <input
              type="checkbox"
              checked={mod.required || isPendingMod(mod.id)}
              disabled={mod.required}
              on:change={(event) =>
                setPendingMod(
                  mod.id,
                  (event.currentTarget as HTMLInputElement).checked,
                )} />
            <span>
              <strong>{mod.name}</strong>
              <small>
                {mod.id}，{mod.objectCount.toLocaleString()} {t("个对象")}
                {#if mod.required}，{t("必需")}{/if}
              </small>
            </span>
          </label>
        {/each}
      </div>
      <div class="mod-actions">
        <button type="button" on:click={selectAllMods} disabled={$loadProgress !== null}>全选</button>
        <button type="button" on:click={selectNoMods} disabled={$loadProgress !== null}>全不选</button>
        <button type="button" on:click={applyModSelection} disabled={$loadProgress !== null}>应用选择</button>
        <button type="button" on:click={restoreDefaultMods} disabled={$loadProgress !== null}>恢复默认</button>
      </div>
    </details>
  {/if}

  <p class="data-options">
    {t("版本:")}
    {#if $data}
      <strong>{$data.build_number}</strong>
    {:else}
      <em style="color: var(--cata-color-gray)">({t("Loading...")})</em>
    {/if}
  </p>
  {/key}
</main>

<style>
main {
  text-align: left;
  padding: 1.5em 1em 3em;
  max-width: 980px;
  margin: 0 auto;
  margin-top: 4rem;
}
header {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 100;
  box-shadow: 0px 0px 8px rgba(0, 0, 0, 0.5);
  width: 100%;
  height: 4rem;
  background: rgba(33, 33, 33, 0.98);
  padding: 0 calc(1em + 8px);
  box-sizing: border-box;
}

nav {
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
}

nav > .search {
  flex: 1;
  margin: 0;
  max-width: calc(0.5 * 980px);
}

nav > .title .narrow {
  display: none;
}

nav > .title {
  margin-right: 1em;
}

@media (max-width: 600px) {
  nav > .title .wide {
    display: none;
  }
  nav > .title .narrow {
    display: inline;
  }

  nav > .search {
    flex: 1;
  }
}

.dont-panic {
  float: right;
  margin: 0 0 1rem 2rem;
}

.guide-quote {
  color: var(--cata-color-light-gray);
  font-style: italic;
}

.catalog-list {
  line-height: 1.55;
}

@media (max-width: 700px) {
  .dont-panic {
    float: none;
    display: block;
    width: min(100%, 343px);
    height: auto;
    margin: 0 auto 1rem;
  }
}

.mod-options {
  margin-top: 2rem;
  border-top: 1px solid var(--cata-color-dark-gray);
  padding-top: 1rem;
}

.mod-options > summary {
  cursor: pointer;
  font-weight: bold;
}

.mod-note {
  color: var(--cata-color-light-gray);
}

.mod-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 0.5rem 1rem;
  margin: 1rem 0;
}

.mod-grid label {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  border: 1px solid var(--cata-color-dark-gray);
  padding: 0.6rem;
}

.mod-grid label > span {
  display: flex;
  flex-direction: column;
}

.mod-grid small {
  color: var(--cata-color-gray);
}

.required-mod {
  opacity: 0.8;
}

.mod-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.load-error {
  border: 1px solid var(--cata-color-light-red);
  padding: 1rem;
  margin-bottom: 1rem;
}

.data-options select {
  max-width: 100%;
}
</style>
