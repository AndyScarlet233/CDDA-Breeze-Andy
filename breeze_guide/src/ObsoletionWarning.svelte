<script lang="ts">
import { mapType } from "./data";
import { guideTypeName } from "./界面翻译";

export let item: any;
</script>

<section class="obsoletion-warning">
  ⚠️ 这个{guideTypeName(mapType(item.type))}被标记为<em>已废弃</em>，通常无法在当前版本中获取。
</section>

<style>
.obsoletion-warning {
  background-color: #69553f;
}
</style>
