# dns-guardian
This Chrome extension blocks requests to domains that have different nameservers (NS records) from their parent domains. This can help identify and block potential tracking domains that are controlled by third parties.

## How it works

1. For each web request, the extension extracts the domain name
2. It checks the NS records of both the domain and its parent domain using Google's DNS-over-HTTPS API
3. If the domain's NS records don't share any nameservers with its parent domain, the request is blocked
4. Results are cached for 5 minutes to improve performance

## Features

- Blocks requests to domains with different NS records from their parent domains
- Uses DNS-over-HTTPS for secure DNS lookups
- Implements caching to reduce DNS queries
- Works with all types of web requests (images, scripts, XHR, etc.)

## Installation

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory

## Example

If a website `example.com` uses nameservers from CloudFlare, but `tracking.example.com` uses nameservers from a different provider, requests to `tracking.example.com` will be blocked.

## Permissions Used

- `webRequest`: To intercept and block web requests
- `webRequestBlocking`: To block requests synchronously
- `dns`: To resolve DNS records
- `<all_urls>`: To check requests to all domains

## Caveats

Requires manifest v2
