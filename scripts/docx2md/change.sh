#!/bin/bash

# 确保脚本在Windows和Linux上都能运行
set -e

# 定义目标目录
TARGET_DIR="drill-docx"

# 检查目标目录是否存在
if [ ! -d "$TARGET_DIR" ]; then
  echo "错误：找不到 $TARGET_DIR 目录"
  exit 1
fi

echo "开始将 docx/doc/txt 文件转换为 Markdown 格式..."

# 计数器
CONVERTED_COUNT=0
DELETED_COUNT=0

# 保存原始目录
ORIGINAL_DIR=$(pwd)

# 进入目标目录
cd "$TARGET_DIR"

# 首先查找并删除以~$开头的临时文件
echo "查找并删除临时文件..."
find . -type f \( -name "~\$*.docx" -o -name "~\$*.doc" \) | while read -r temp_file; do
  echo "删除临时文件: $temp_file"
  rm -f "$temp_file"
  DELETED_COUNT=$((DELETED_COUNT+1))
done

# 使用find命令查找所有docx、doc和txt文件
find . -type f \( -name "*.docx" -o -name "*.doc" -o -name "*.txt" \) | while read -r file; do
  # 检查文件名是否以~$开头，如果是则跳过
  filename=$(basename "$file")
  if [[ "$filename" == ~\$* ]]; then
    echo "跳过临时文件: $file (已在前面步骤删除)"
    continue
  fi

  # 获取目录和文件名
  dir=$(dirname "$file")
  name_without_ext="${filename%.*}"
  output="$dir/$name_without_ext.md"

  # 输出正在转换的文件
  echo "正在转换: $file -> $output"

  # 使用pandoc进行转换
  pandoc -s "$file" -o "$output"

  # 输出生成的md文件路径
  echo "已生成: $output"
  CONVERTED_COUNT=$((CONVERTED_COUNT+1))
done

# 返回原始目录
cd "$ORIGINAL_DIR"

echo "转换完成！共转换 $CONVERTED_COUNT 个文件为Markdown格式，删除 $DELETED_COUNT 个临时文件。"
