#!/usr/bin/bash

cd "$(dirname "$0")"
set -ex

source ./config.env
versatiles serve -p 8080 -s web -s ${dir_data}frontend-dev.br.tar.gz [orthophotos]${dir_data}orthophotos.vpl
