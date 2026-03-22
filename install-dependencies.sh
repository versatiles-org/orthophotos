#!/usr/bin/env bash
set -euo pipefail

# Install all external CLI dependencies (except versatiles, which must be installed separately).

if [ "$(id -u)" -ne 0 ]; then
	echo 'This script must be run as root (or via sudo).' >&2
	exit 1
fi

apt-get update

apt-get install -y \
	curl \
	p7zip-full \
	unzip
