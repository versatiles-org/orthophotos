set -e
cd "$(dirname "$0")"

NAME=$1

# error if not set
if [ -z "$NAME" ]; then
  echo "Usage: $0 <name>"
  exit 1
fi

# ensure format is "*/*"
if [[ ! "$NAME" =~ ^[^/]+(/[^/]+)?$ ]]; then
  echo "Error: NAME must be in the format 'folder/file'"
  exit 1
fi

mkdir -p "$NAME"
rsync -ahtWe "ssh -p 23 -i ~/.ssh/id_ed25519" --delete --info progress2 "$NAME/" "u417480@u417480.your-storagebox.de:orthophoto/$NAME/"
