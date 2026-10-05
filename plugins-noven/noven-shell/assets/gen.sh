#!/bin/bash
G="python3 /Users/noven/.agents/skills/gen-image/scripts/gen_image.py --alias flare"
$G --prompt "精美插画，深夜末班公交车驶出海边小站，海潮倒卷泛着微光，日系动画电影质感，柔和夜色青蓝色调，安静治愈，无文字无水印" --ratio 3:4 --out cover-haibian.webp > cover-haibian.log 2>&1
$G --prompt "精美插画，文明崩塌后的巨大档案馆内部，高耸的书架延伸到黑暗里，一台发光的老式终端独自亮着，科幻末日后氛围，暖光点缀冷色调，无文字无水印" --ratio 3:4 --out cover-mori.webp > cover-mori.log 2>&1
$G --prompt "精美插画，海雾弥漫的小岛上一座小小的木质邮局，暖黄灯光从窗口透出，信箱前停着一辆自行车，吉卜力风格，安静温柔，无文字无水印" --ratio 3:4 --out cover-wudao.webp > cover-wudao.log 2>&1
$G --prompt "精美人物头像插画，修仙门派年轻长老沈砚，墨色长发束起，深色长袍，沉静内敛的眼神，半身胸像，工笔国风，干净浅色背景，无文字无水印" --ratio 4:5 --out avatar-shenyan.webp > avatar-shenyan.log 2>&1
$G --prompt "精美人物头像插画，修仙门派老掌门云鹤，白发白须，宽大道袍，慈和而威严的气质，半身胸像，工笔国风，干净浅色背景，无文字无水印" --ratio 4:5 --out avatar-yunhe.webp > avatar-yunhe.log 2>&1
$G --prompt "精美的修仙门派山门俯瞰地图插画，云雾缭绕的山峰，主峰上有大殿，侧峰有藏经阁与寒潭，山间小径相连，国风工笔地图风格，鸟瞰视角，淡雅青绿山水色调，无文字无水印" --ratio 16:9 --out wb-map.webp > wb-map.log 2>&1
$G --prompt "精美的黑白线稿漫画四格拼页，修仙门派夜晚场景，弟子们在廊下争执继任之事，烛光、月色、飞檐，分镜漫画排版，干净线条，无文字无水印" --ratio 4:3 --out wb-comic.webp > wb-comic.log 2>&1
$G --prompt "精美的人物志合集排版插画，三个修仙人物胸像卡片排列，掌门长老弟子，每个人物配淡雅色块衬底，档案册页质感，国风工笔，浅米色背景，无文字无水印" --ratio 4:3 --out wb-renwuzhi.webp > wb-renwuzhi.log 2>&1
$G --prompt "柔和低饱和水彩淡彩插画，竖版构图：云雾中的悬浮群岛，几座长满绿树的岩石小岛漂浮在云海之上，远处一座朦胧的远山主峰，雾灰青绿色调，大量留白的天空，空灵安静，日式淡彩质感，无文字无水印" --ratio 3:4 --out cover-new-world.webp > cover-new-world.log 2>&1
$G --prompt "柔和低饱和水彩淡彩插画，竖版构图：一个人物的背影半身像，深色中长发被风吹起，穿浅灰宽松外套背着小包，站在留白的天空与远山之间，雾灰蓝绿色调，安静克制，日式淡彩质感，无文字无水印" --ratio 3:4 --out cover-new-character.webp > cover-new-character.log 2>&1
$G --prompt "柔和低饱和水彩淡彩插画，横版小图：云海上几座漂浮的绿色小岛，空灵安静，雾灰青绿色调，日式淡彩质感，无文字无水印" --ratio 16:9 --out tpl-islands.webp > tpl-islands.log 2>&1
$G --prompt "柔和低饱和水彩淡彩插画，横版小图：黄昏时分的山间小镇，层层叠叠的木屋亮着暖黄小灯，雾气弥漫，紫灰色调，神秘安静，日式淡彩质感，无文字无水印" --ratio 16:9 --out tpl-town.webp > tpl-town.log 2>&1
$G --prompt "柔和低饱和水彩淡彩插画，横版小图：热带小岛海滩，白色沙滩和椰子树，碧蓝浅海，明亮清新的淡彩色调，日式水彩质感，无文字无水印" --ratio 16:9 --out tpl-drift.webp > tpl-drift.log 2>&1
echo DONE; ls *.webp
