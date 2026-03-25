#!/usr/bin/env bash

cd "$(dirname "$0")"
set -ex

source ./config.env
versatiles serve -p 8080 --ssh-identity "${ssh_id}" -s web -s "${dir_data}frontend.br.tar.gz" "[satellite]${dir_data}orthophotos.vpl"
