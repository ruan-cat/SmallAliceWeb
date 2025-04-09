#!/bin/bash

# 确保脚本在Windows和Linux上都能运行
set -e

# 开始计时
START_TIME=$(date +%s)

# 定义目标目录和输出目录
SOURCE_DIR="drill-docx"
OUTPUT_DIR="docs/docx"

# 检查目标目录是否存在
if [ ! -d "$SOURCE_DIR" ]; then
  echo "错误：找不到 $SOURCE_DIR 目录"
  exit 1
fi

# 创建输出目录（如果不存在）
if [ ! -d "$OUTPUT_DIR" ]; then
  echo "创建输出目录: $OUTPUT_DIR"
  mkdir -p "$OUTPUT_DIR"
fi

echo "开始将 docx/doc/txt 文件转换为 Markdown 格式..."

# 计数器
CONVERTED_COUNT=0
DELETED_COUNT=0
FAILED_COUNT=0

# 保存原始目录
ORIGINAL_DIR=$(pwd)

# 创建临时文件用于存储失败的文件列表
FAILED_FILES_LIST=$(mktemp)

# 进入源目录
cd "$SOURCE_DIR"
SOURCE_ABS_PATH=$(pwd)

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

  # 获取相对路径目录和文件名
  rel_dir=$(dirname "$file")
  name_without_ext="${filename%.*}"

  # 创建对应的输出目录
  output_dir="$ORIGINAL_DIR/$OUTPUT_DIR/$rel_dir"
  if [ ! -d "$output_dir" ]; then
    echo "创建输出目录: $output_dir"
    mkdir -p "$output_dir"
  fi

  # 设置输出文件路径
  output="$output_dir/$name_without_ext.md"

  # 创建图片存储目录
  image_dir="$output_dir/images"
  if [ ! -d "$image_dir" ]; then
    echo "创建图片目录: $image_dir"
    mkdir -p "$image_dir"
  fi

  # 输出正在转换的文件
  echo "正在转换: $file -> $output"

  # 使用pandoc进行转换，并提取图片到images文件夹
  if pandoc -s "$file" -o "$output" --extract-media="$image_dir" 2>/dev/null; then
    # 输出生成的md文件路径
    echo "已生成: $output"
    CONVERTED_COUNT=$((CONVERTED_COUNT+1))
  else
    echo "转换失败: $file" | tee -a "$FAILED_FILES_LIST"
    FAILED_COUNT=$((FAILED_COUNT+1))
  fi
done

# 返回原始目录
cd "$ORIGINAL_DIR"

# 结束计时并计算总用时
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

# 输出结果统计
echo "========================================"
echo "转换完成！统计信息如下："
echo "- 共转换成功: $CONVERTED_COUNT 个文件"
echo "- 共删除临时文件: $DELETED_COUNT 个"
echo "- 共转换失败: $FAILED_COUNT 个"
echo "- 总用时: ${MINUTES}分${SECONDS}秒"
echo "========================================"

# 如果有失败的文件，输出失败文件列表
if [ $FAILED_COUNT -gt 0 ]; then
  echo "转换失败的文件列表:"
  cat "$FAILED_FILES_LIST"
  echo "========================================"
fi

# 清理临时文件
rm -f "$FAILED_FILES_LIST"
