#!/usr/bin/env bash
set -euo pipefail

# Install all external CLI dependencies (except versatiles, which must be installed separately).

OS="$(uname -s)"

case "$OS" in
	Darwin)
		if ! command -v brew &>/dev/null; then
			echo 'Homebrew is required on macOS. Install it from https://brew.sh' >&2
			exit 1
		fi

		brew install curl gdal sevenzip unzip

		# Homebrew's sevenzip provides 7zz but many scripts expect 7z.
		# Create a symlink if 7z is not already available.
		if ! command -v 7z &>/dev/null && command -v 7zz &>/dev/null; then
			ln -sf "$(command -v 7zz)" "$(dirname "$(command -v 7zz)")/7z"
			echo 'Created symlink: 7z -> 7zz'
		fi
		;;

	Linux)
		if [ "$(id -u)" -ne 0 ]; then
			echo 'On Linux this script must be run as root (or via sudo).' >&2
			exit 1
		fi

		apt-get update
		apt-get install -y \
			curl \
			gdal-bin \
			p7zip-full \
			unzip
		;;

	*)
		echo "Unsupported OS: $OS" >&2
		exit 1
		;;
esac

# Verify that 7z works
if ! 7z --help &>/dev/null; then
	echo 'Error: 7z is not working after installation.' >&2
	exit 1
fi

echo 'All dependencies installed successfully.'
