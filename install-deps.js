const { spawnSync } = require("child_process");
const path = require("path");
const os = process.platform;

const isWindows = process.platform === "win32";

//Function to check if running as Administrator
function isAdmin() {
  if (!isWindows) return true;
  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-Command", "([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
  ], { encoding: "utf8" });

  return result.stdout.trim() === "True";
}

if (isWindows) {
  console.log("🟣 Installing Windows dependencies...");

  if (!isAdmin()) {
    console.log("🔴 Not running as admin. Restarting as administrator...");
    
    //Relaunch as admin to keep window open
	const scriptPath = path.join(__dirname, "install-deps-windows.ps1");
	const result = spawnSync("powershell.exe", [
		"-NoProfile", "-ExecutionPolicy", "Bypass",
		"-Command", `Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \\"${scriptPath}\\"' -Verb RunAs -Wait`
	], { stdio: "inherit", shell: true });

    if (result.error) {
      console.error("⚠️ Failed to elevate PowerShell:", result.error);
      process.exit(1);
    }
    
    console.log("✅ Dependency installation completed!");
    process.exit(result.status);
  }

  //Run PowerShell script synchronously (when already elevated)
  const scriptPath = path.join(__dirname, "install-deps-windows.ps1");
  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", scriptPath
  ], { stdio: "inherit", shell: true });

  if (result.status !== 0) {
    console.error("⚠️ PowerShell script failed with exit code:", result.status);
    process.exit(1);
  }

  console.log("✅ Windows dependency installation complete.");

} else if (os === "linux") {
  console.log("🟢 Installing Linux dependencies...");
  spawnSync("bash", ["./install-deps-linux.sh"], { stdio: "inherit" });

} else if (os === "darwin") {
  console.log("🍎 Installing macOS dependencies...");
  spawnSync("bash", ["./install-deps-mac.sh"], { stdio: "inherit" });

} else {
  console.log("❌ Unsupported OS detected.");
  process.exit(1);
  
}
