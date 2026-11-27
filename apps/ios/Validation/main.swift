// Run with ResolverProbe.swift on macOS. All inputs are synthetic.
let control: Set<String> = ["192.0.2.10"]
let sinks: Set<String> = ["0.0.0.0", "::"]
let cases: [(Set<String>, Set<String>, ProbeResult)] = [
    (control, sinks, .blocked), (control, ["::"], .blocked),
    (control, ["0.0.0.0", "2001:db8::1"], .open),
    (control, control, .open), ([], sinks, .unknown),
    (sinks, sinks, .unknown), (control, [], .unknown)
]
for (normal, category, expected) in cases {
    precondition(ProbeResult.evaluate(control: normal, category: category) == expected)
}
print("Passed all \(cases.count) resolver classification cases.")
