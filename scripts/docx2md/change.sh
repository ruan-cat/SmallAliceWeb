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

# 递归函数，用于遍历目录
process_directory() {
  local dir=$1
  # 进入指定目录
  cd "$dir"

  # 遍历当前目录下的所有文件和子目录
  for item in *; do
    # 检查项目是否存在（避免通配符展开为*）
    if [ -e "$item" ]; then
      if [ -d "$item" ]; then
        # 如果是目录，递归处理
        echo "进入目录: $dir/$item"
        process_directory "$item"
        cd ..  # 返回上级目录
      elif [[ "$item" == *.docx ]] || [[ "$item" == *.doc ]] || [[ "$item" == *.txt ]]; then
        # 如果是docx/doc/txt文件，进行转换
        filename="${item%.*}"
        output="$filename.md"
        echo "正在转换: $dir/$item -> $dir/$output"

        # 使用pandoc进行转换
        pandoc -s "$item" -o "$output"

        # 输出生成的md文件路径
        echo "已生成: $dir/$output"
        ((CONVERTED_COUNT++))
      fi
    fi
  done
}

# 开始处理
cd "$TARGET_DIR"
ORIGINAL_DIR=$(pwd)
process_directory "."
cd "$ORIGINAL_DIR"

echo "转换完成！共转换 $CONVERTED_COUNT 个文件为Markdown格式。"
