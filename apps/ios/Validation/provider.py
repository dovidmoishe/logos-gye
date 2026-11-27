"""Check the public provider with safe fixtures, independently of system DNS settings."""
import ipaddress
import json
from urllib.request import Request, urlopen

for kind, number in (("A", 1), ("AAAA", 28)):
    for domain, should_block in (("example.com", False), ("nudity.testcategory.com", True)):
        endpoint = f"https://family.cloudflare-dns.com/dns-query?name={domain}&type={kind}"
        request = Request(endpoint, headers={"Accept": "application/dns-json"})
        with urlopen(request, timeout=10) as response:
            data = json.load(response)
        answers = [ipaddress.ip_address(a["data"]) for a in data.get("Answer", []) if a["type"] == number]
        if data["Status"] != 0 or not answers or any(a.is_unspecified != should_block for a in answers):
            raise SystemExit(f"Unexpected {kind} result for {domain}: {answers}")
        print(f"PASS {domain} {kind}")
