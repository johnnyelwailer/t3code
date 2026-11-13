/** Process liveness and self-exclusion. Windows and POSIX both honor `process.kill(pid, 0)`. */
export const isProcessAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
};

export const isSelfPid = (pid: number, selfPids: readonly number[] = [process.pid]): boolean =>
  selfPids.includes(pid);
