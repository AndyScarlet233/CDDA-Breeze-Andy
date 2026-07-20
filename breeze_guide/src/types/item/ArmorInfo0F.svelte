<script lang="ts">
import { getContext } from "svelte";
import { CddaData, singular } from "../../data";
import type { ArmorPortionData, ArmorSlot, ItemBasicInfo } from "../../types";

export let item: ItemBasicInfo & ArmorSlot;
let data = getContext<CddaData>("data");

function isStrings<T>(array: string[] | T[]): array is string[] {
  return Array.isArray(array) && typeof array[0] === "string";
}

const normalizedMaterial =
  item.material == null
    ? []
    : typeof item.material === "string"
      ? [{ type: item.material, portion: 1 }]
      : Array.isArray(item.material)
        ? isStrings(item.material)
          ? item.material.map((s) => ({ type: s, portion: 1 }))
          : item.material
        : Object.entries(item.material).map(([type, portion]) => ({
            type,
            portion: portion as number,
          }));

let materials = normalizedMaterial.map((m) => ({
  material: data.byId("material", m.type),
  portion: m.portion,
}));
const totalMaterialPortion = materials.reduce(
  (m, o) => m + (o.portion ?? 1),
  0,
);

function covers(body_part_id: string): boolean {
  return (
    (item.covers ?? []).includes(body_part_id) ||
    (item.armor ?? []).some((apd) => (apd.covers ?? []).includes(body_part_id))
  );
}
let covers_anything = (item.covers ?? []).length || (item.armor ?? []).length;

const armor =
  item.armor ?? ((item as any).armor_portion_data as ArmorPortionData[]);

function coverageLabel(apd: ArmorPortionData): string[] {
  const covered = new Set();
  const labels: string[] = [];
  for (const bp_id of apd.covers ?? []) {
    if (covered.has(bp_id)) continue;
    const bp = data.byId("body_part", bp_id);
    if (bp.opposite_part && apd.covers!.includes(bp.opposite_part)) {
      labels.push(singular(bp.heading_multiple));
      covered.add(bp.opposite_part);
    } else {
      labels.push(singular(bp.heading));
    }
    covered.add(bp_id);
  }
  return labels;
}
</script>

<section>
  <h1>护甲</h1>
  <dl>
    <dt>覆盖部位</dt>
    <dd>
      {#if covers("head")}<strong>头部</strong>。{/if}
      {#if covers("eyes")}<strong>眼部</strong>。{/if}
      {#if covers("mouth")}<strong>嘴部</strong>。{/if}
      {#if covers("torso")}<strong>躯干</strong>。{/if}

      {#each [["arm", "arms"], ["hand", "hands"], ["leg", "legs"], ["foot", "feet"]] as [sg, pl]}
        {#if item.sided && (covers(`${sg}_l`) || covers(`${sg}_r`))}
          任意一侧的 <strong>{sg}</strong>。
        {:else if covers(`${sg}_l`) && covers(`${sg}_r`)}
          双侧 <strong>{pl}</strong>。
        {:else if covers(`${sg}_l`)}
          <strong>左侧 {sg}</strong>。
        {:else if covers(`${sg}_r`)}
          <strong>右侧 {sg}</strong>。
        {/if}
        {" "}
      {/each}

      {#if !covers_anything}无。{/if}
    </dd>
    <dt>层级</dt>
    <dd>
      {#if (item.flags ?? []).includes("PERSONAL")}个人光环
      {:else if (item.flags ?? []).includes("SKINTIGHT")}贴身
      {:else if (item.flags ?? []).includes("BELTED")}绑缚层
      {:else if (item.flags ?? []).includes("OUTER")}Outer
      {:else if (item.flags ?? []).includes("WAIST")}Waist
      {:else if (item.flags ?? []).includes("AURA")}外部光环
      {:else}普通层
      {/if}
    </dd>
    <dt>保暖</dt>
    <dd>{item.warmth ?? 0}</dd>
    <dt>累赘</dt>
    <dd>
      {#if armor}
        <dl>
          {#each armor as apd}
            <dt>
              {#each coverageLabel(apd) as label, i}{#if i !== 0}{", "}{/if}{label}{/each}
            </dt>
            <dd>
              {#if Array.isArray(apd.encumbrance)}
                {apd.encumbrance[0]}
                {#if apd.encumbrance[1] !== apd.encumbrance[0]}
                  ({apd.encumbrance[1]}，装满时)
                {/if}
              {:else}
                {apd.encumbrance ?? 0}
              {/if}
            </dd>
          {/each}
        </dl>
      {:else}
        {item.encumbrance ??
          0}{#if item.max_encumbrance}{" "}({item.max_encumbrance}，装满时){/if}
      {/if}
    </dd>
    <dt
      title="决定攻击命中这件装备而不是穿戴者的概率。">
      覆盖率
    </dt>
    <dd>
      {#if item.armor}
        <dl>
          {#each item.armor as apd}
            <dt>
              {#each coverageLabel(apd) as label, i}{#if i !== 0}{", "}{/if}{label}{/each}
            </dt>
            <dd>{apd.coverage ?? 0}%</dd>
          {/each}
        </dl>
      {:else}
        {item.coverage ?? 0}%
      {/if}
    </dd>
    {#if materials.length || item.environmental_protection}
      <dt>防护</dt>
      <dd>
        <dl>
          {#if materials.length}
            <dt>钝击</dt>
            <dd>
              {(
                (materials.reduce(
                  (m, o) =>
                    m + (o.material.bash_resist ?? 0) * (o.portion ?? 1),
                  0,
                ) *
                  (item.material_thickness ?? 0)) /
                totalMaterialPortion
              ).toFixed(2)}
            </dd>
            <dt>斩击</dt>
            <dd>
              {(
                (materials.reduce(
                  (m, o) => m + (o.material.cut_resist ?? 0) * (o.portion ?? 1),
                  0,
                ) *
                  (item.material_thickness ?? 0)) /
                totalMaterialPortion
              ).toFixed(2)}
            </dd>
            <dt>弹道</dt>
            <dd>
              {(
                (materials.reduce(
                  (m, o) =>
                    m + (o.material.bullet_resist ?? 0) * (o.portion ?? 1),
                  0,
                ) *
                  (item.material_thickness ?? 0)) /
                totalMaterialPortion
              ).toFixed(2)}
            </dd>
            <dt>酸蚀</dt>
            <dd>
              {(() => {
                let resist =
                  materials.reduce(
                    (m, o) =>
                      m + (o.material.acid_resist ?? 0) * (o.portion ?? 1),
                    0,
                  ) / totalMaterialPortion;
                const env = item.environmental_protection ?? 0;
                if (env < 10) resist *= env / 10;
                return resist;
              })().toFixed(2)}
            </dd>
            <dt>火焰</dt>
            <dd>
              {(() => {
                let resist =
                  materials.reduce(
                    (m, o) =>
                      m + (o.material.fire_resist ?? 0) * (o.portion ?? 1),
                    0,
                  ) / totalMaterialPortion;
                const env = item.environmental_protection ?? 0;
                if (env < 10) resist *= env / 10;
                return resist;
              })().toFixed(2)}
            </dd>
          {/if}
          <dt title="环境防护">环境</dt>
          <dd>{item.environmental_protection ?? 0}</dd>
        </dl>
      </dd>
    {/if}
  </dl>
</section>
