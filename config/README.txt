# 开发用配置（正式发行包不会附带 license.json / selectors.json）
#
# - license.json / selectors.json：仅开发态可读；打包后走
#   src/boguanjia/resources/ 内置副本，用户改安装目录无效。
# - default_settings.json：会打进发行包 config/，作为首次默认参数。
#
# 修改选择器或授权文案时：请同步改
#   src/boguanjia/resources/ 与本目录对应文件，再重新打包。
