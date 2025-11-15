#!/bin/bash

# open-nof1.ai - AI 加密货币自动交易系统
# Copyright (C) 2025 195440
# 
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
# 
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU Affero General Public License for more details.
# 
# You should have received a copy of the GNU Affero General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.

# =====================================================
# 快速同步持仓（不重置数据库）
# =====================================================

set -e

echo "=================================================="
echo "  从交易所同步持仓"
echo "=================================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔄 正在同步持仓数据...${NC}"
echo ""

# 执行同步脚本
npx tsx --env-file=.env ./src/database/sync-positions-only.ts

echo ""
echo "=================================================="
echo -e "${GREEN}✅ 持仓同步完成！${NC}"
echo "=================================================="
echo ""






