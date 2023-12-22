// cacheBuster.ts
function generateCacheBuster(): string {
  // Find the main.ts script tag and remove it
  const mainScript: HTMLScriptElement | null = document.querySelector('script[src*="main.ts"]');
  if (mainScript) {
    mainScript.remove();
  }
  // Generate a cache buster value based on the current timestamp
    const currentTimestamp: number = Math.floor(Date.now() / 1000);
    // Divide by 3600 to create a cache buster value that updates every hour
    const cacheBusterValue: number = Math.floor(currentTimestamp / 3600);
    return `?v=${cacheBusterValue}`;
  }

  // Set the src attribute for main.ts script
  const script: HTMLScriptElement = document.createElement('script');
  script.type = 'module';
  script.src = `/main.ts${generateCacheBuster()}`;
  document.head.appendChild(script);
  