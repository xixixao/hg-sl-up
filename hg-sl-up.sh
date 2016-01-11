#!/bin/bash

if [ "$1" = "--help" ] || [ "$1" = "help" ]; then
  echo "hg-sl-up [OPTIONS] [HG_SL_OPTIONS] -- [HG_UP_OPTIONS]"
  echo ""
  echo "select commit/boookmark with keyboard from smart log and update to it"
  echo ""
  echo "    Use up and down arrow keys to select previous and next commit"
  echo "    respectively. Use left and right arrow keys to select previous and"
  echo "    next bookmark respectively on a selected commit. Hit enter to"
  echo "    update to the selected commit or bookmark. Hit q, CTRL-C or Esc"
  echo "    to exit without updating."
  echo ""
  echo "    HG_SL_OPTIONS are options that are passed to hg sl."
  echo "    HG_UP_OPTIONS are options that are passed to hg update."
  echo ""
  echo "    For example:"
  echo ""
  echo "        hg-sl-up --stat -- --quiet"
  echo ""
  echo "    shows the stats for each commit (hg sl --stat) and doesn't print"
  echo "    the summary of the update (hg up --quiet)."
  echo ""
  echo "OPTIONS can be any of:"
  echo " --help     shows this help listing"
  exit
fi

# Find -- if present
sep=
args=("$@")
for ((i=0; i<${#args[@]}; i++)); do
  if [[ "${args[i]}" = "--" ]]; then
    sep="$i";
  fi
done
sep="${sep:-$#}"
to=$((sep))

# because for some reason, the range below does not compute correctly
if [ $to -gt 1 ]; then
  to=$((to+1));
fi

# split arg list
sl_args=${args[@]:0:$to}
up_args=${args[@]:($sep + 2)}

# Get path to our node module
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE" # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"

# Actual interactive editing

tput smcup && stty -echo # enter fullscreen
node "$DIR/index.js" $sl_args

# No way to execute so node knows the window size and save output as well
# TO="$(node "$DIR/index.js" $sl_args | tee /dev/tty | tail -n1)"

# So use a tempfile
TO=`cat .____hg-sl-up-to`
rm ".____hg-sl-up-to"
tput rmcup && stty echo && # leave fullscreen
[[ ! -z  $TO ]] &&
hg up ${up_args[@]} $TO
