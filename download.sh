set -e

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
rsync -ahtWe "ssh -p 23 -i ~/.ssh/id_ed25519" --info progress2 "u417480@u417480.your-storagebox.de:orthophoto/$NAME/" "$NAME/"
