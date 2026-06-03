# Asimi runtime — DO NOT MODIFY. Installed into /etc/bash.bashrc at image build
# time so the command-wrapper protocol (__asimi_run) is always available in
# interactive bash shells regardless of user customizations to ~/.bashrc.
__asimi_run() {
  local id="$1"
  local cmd="$2"
  printf "__ASIMI_STDOUT_START:%s\n" "$id"
  (eval "$cmd" </dev/null)
  local exit_code=$?
  printf "__ASIMI_STDOUT_END:%s:%s\n" "$id" "$exit_code"
  return $exit_code
}
