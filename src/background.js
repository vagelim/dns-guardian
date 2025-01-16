// Cache for DNS results to avoid excessive lookups
const dnsCache = new Map();
const cacheTTL = 5 * 60 * 1000; // 5 minutes

// Track root domains of active tabs
const activeRootDomains = new Set();

async function getDnsServers(domain) {
  try {
    console.log(`🔍 Fetching NS records for ${domain}`);
    const url = `https://dns.google/resolve?name=${domain}&type=NS`;
    console.log(`📡 DNS query URL: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log(`📥 Raw DNS response for ${domain}:`, data);
    
    // Check for errors in the DNS response
    if (data.Status !== 0) {
      console.log(`⚠️ DNS query returned status ${data.Status} for ${domain}`);
      return { servers: [], authority: null };
    }
    
    // First check Answer section for NS records
    if (data.Answer) {
      const servers = data.Answer
        .filter(record => record.type === 2) // NS record type is 2
        .map(record => record.data.toLowerCase());
      if (servers.length > 0) {
        console.log(`✅ NS records for ${domain} (from Answer):`, servers);
        return { servers, authority: null };
      }
    }
    
    // Then check Authority section
    if (data.Authority) {
      // First find the SOA record to determine authority
      const soaRecord = data.Authority.find(record => record.type === 6); // SOA record
      const authority = soaRecord ? soaRecord.name.toLowerCase() : null;
      
      // Then look for NS records
      const servers = data.Authority
        .filter(record => record.type === 2)
        .map(record => record.data.toLowerCase());

      console.log(`🔍 Authority for ${domain}:`, authority);
      if (servers.length > 0) {
        console.log(`✅ NS records for ${domain} (from Authority):`, servers);
        return { servers, authority };
      }
      
      // If we found an authority but no NS records, this is significant
      if (authority) {
        console.log(`ℹ️ Found authority ${authority} for ${domain} but no NS records`);
        return { servers: [], authority };
      }
    }
    
    // If we get here, we tried to look up the records but found none
    console.log(`⚠️ No NS records or authority found for ${domain}`);
    return { servers: [], authority: null };
  } catch (error) {
    console.error(`❌ Error fetching NS records for ${domain}:`, error);
    console.error(error);
    return { servers: [], authority: null };
  }
}

function getRootDomain(domain) {
  const parts = domain.split('.');
  // If we have 2 or fewer parts, it's already a root domain
  if (parts.length <= 2) return domain;
  
  // Get the last two parts for the root domain (e.g., everbody.com)
  const rootDomain = parts.slice(-2).join('.');
  console.log(`For domain ${domain}, root domain is ${rootDomain}`);
  return rootDomain;
}

async function shouldBlockDomain(domain) {
  console.log(`\nChecking domain: ${domain}`);
  
  // Check cache first
  const cachedResult = dnsCache.get(domain);
  if (cachedResult && Date.now() - cachedResult.timestamp < cacheTTL) {
    console.log(`Using cached result for ${domain}:`, cachedResult.shouldBlock);
    return cachedResult.shouldBlock;
  }

  const rootDomain = getRootDomain(domain);
  if (domain === rootDomain) {
    console.log(`Domain ${domain} is already a root domain, not blocking`);
    return false;
  }

  const domainResult = await getDnsServers(domain);
  const rootResult = await getDnsServers(rootDomain);

  console.log(`\nComparison for ${domain}:`);
  console.log(`Domain NS servers:`, domainResult.servers);
  console.log(`Domain authority:`, domainResult.authority);
  console.log(`Root domain NS servers:`, rootResult.servers);

  // If we couldn't get root NS records, we can't make a decision
  if (!rootResult.servers.length) {
    console.log('⚠️ Missing root NS records, cannot make a decision');
    return false;
  }

  // If we found an authority record that's different from the root domain,
  // this indicates delegation to a different zone
  if (domainResult.authority && 
      domainResult.authority !== rootDomain && 
      !domainResult.authority.endsWith(`.${rootDomain}`)) {
    console.log(`🛑 Domain ${domain} is delegated to ${domainResult.authority} - blocking`);
    return true;
  }

  // If we have NS records for the domain, compare them with root
  if (domainResult.servers.length > 0) {
    const hasCommonNameserver = domainResult.servers.some(ns => {
      const matches = rootResult.servers.includes(ns);
      if (matches) {
        console.log(`Found matching nameserver: ${ns}`);
      }
      return matches;
    });
    
    if (!hasCommonNameserver) {
      console.log(`🛑 No matching nameservers between domain and root - blocking`);
      return true;
    }
    return false;
  }

  // If we get here, we have root records but no subdomain records or authority
  console.log('🛑 No NS records for subdomain but root has records - blocking');
  const shouldBlock = true;
  dnsCache.set(domain, {
    shouldBlock,
    timestamp: Date.now()
  });
  return shouldBlock;
}

function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    console.log(`Extracted hostname from ${url}: ${hostname}`);
    return hostname;
  } catch (e) {
    console.error(`Failed to extract domain from ${url}:`, e);
    return null;
  }
}

// Track tab updates to maintain the set of root domains
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const domain = extractDomain(changeInfo.url);
    if (domain) {
      const rootDomain = getRootDomain(domain);
      activeRootDomains.add(rootDomain);
      console.log('🌐 Added root domain to watch list:', rootDomain);
      console.log('Current root domains:', Array.from(activeRootDomains));
    }
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  // We would need to check all remaining tabs to know if we should remove any root domains
  chrome.tabs.query({}, (tabs) => {
    const currentDomains = new Set();
    tabs.forEach(tab => {
      if (tab.url) {
        const domain = extractDomain(tab.url);
        if (domain) {
          currentDomains.add(getRootDomain(domain));
        }
      }
    });
    activeRootDomains.clear();
    currentDomains.forEach(domain => activeRootDomains.add(domain));
    console.log('🧹 Updated root domains after tab removal:', Array.from(activeRootDomains));
  });
});

// Initialize root domains from existing tabs
chrome.tabs.query({}, (tabs) => {
  tabs.forEach(tab => {
    if (tab.url) {
      const domain = extractDomain(tab.url);
      if (domain) {
        activeRootDomains.add(getRootDomain(domain));
      }
    }
  });
  console.log('🏁 Initialized root domains:', Array.from(activeRootDomains));
});

// Keep track of blocking decisions
const blockingDecisions = new Map();

// Listen for web requests at the earliest possible point
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    console.log('\n==================================');
    console.log('🔍 Intercepted request:', details.url);
    console.log('Request details:', details);
    
    const domain = extractDomain(details.url);
    if (!domain) {
      console.log('❌ Could not extract domain from URL');
      return { cancel: false };
    }

    // Don't intercept DNS lookup requests
    if (domain === 'dns.google') {
      console.log('⚡ Skipping DNS lookup request');
      return { cancel: false };
    }

    // Get the root domain of the request
    const requestRootDomain = getRootDomain(domain);
    
    // Only check if this is a subdomain of one of our active root domains
    if (!activeRootDomains.has(requestRootDomain)) {
      console.log(`⏩ Skipping check for ${domain} - not related to current pages`);
      return { cancel: false };
    }

    // Skip if this is the root domain itself
    if (domain === requestRootDomain) {
      console.log(`⏩ Skipping check for ${domain} - is root domain`);
      return { cancel: false };
    }

    // Check if we already made a decision for this domain
    const cachedDecision = blockingDecisions.get(domain);
    if (cachedDecision !== undefined) {
      console.log(`Using cached blocking decision for ${domain}: ${cachedDecision ? 'BLOCK' : 'ALLOW'}`);
      return { cancel: cachedDecision };
    }

    // We need to return a Promise that resolves to the blocking decision
    return new Promise(async (resolve) => {
      try {
        const shouldBlock = await shouldBlockDomain(domain);
        console.log(`\n🚦 Final decision for ${domain}: ${shouldBlock ? '🛑 BLOCK' : '✅ ALLOW'}`);
        console.log('Request URL:', details.url);
        console.log('==================================\n');
        
        // Cache the decision
        blockingDecisions.set(domain, shouldBlock);
        
        // Ensure we're actually blocking
        const response = { cancel: shouldBlock };
        console.log('Returning response:', response);
        resolve(response);
      } catch (error) {
        console.error('❌ Error in blocking decision:', error);
        console.log('==================================\n');
        resolve({ cancel: false });
      }
    });
  },
  { 
    urls: ["<all_urls>"],
    types: ["xmlhttprequest", "script", "image", "media", "websocket", "other"]
  },
  ["blocking"]
);

// Also listen for requests at the headers phase as a backup
chrome.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    const domain = extractDomain(details.url);
    if (!domain) return;

    const cachedDecision = blockingDecisions.get(domain);
    if (cachedDecision) {
      console.log(`🛑 Blocking request at headers phase: ${domain}`);
      return { cancel: true };
    }
  },
  {
    urls: ["<all_urls>"],
    types: ["xmlhttprequest", "script", "image", "media", "websocket", "other"]
  },
  ["blocking"]
);