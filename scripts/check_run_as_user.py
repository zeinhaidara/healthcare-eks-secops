"""Fail if a rendered workload sets runAsGroup without runAsUser (Fargate rejects it). Usage: FILE.yaml [...]"""

import sys

import yaml

WORKLOADS = {"Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob"}


def pod_spec(doc):
    if doc["kind"] == "CronJob":
        return doc["spec"]["jobTemplate"]["spec"]["template"]["spec"]
    return doc["spec"]["template"]["spec"]


def problems(doc):
    name = f'{doc["kind"]}/{doc["metadata"]["name"]}'
    spec = pod_spec(doc)
    pod = spec.get("securityContext") or {}
    if pod.get("runAsGroup") is not None and pod.get("runAsUser") is None:
        yield f"{name}: pod securityContext sets runAsGroup without runAsUser"
    for c in spec.get("initContainers", []) + spec.get("containers", []):
        sc = c.get("securityContext") or {}
        group = sc.get("runAsGroup", pod.get("runAsGroup"))
        user = sc.get("runAsUser", pod.get("runAsUser"))
        if group is not None and user is None:
            yield f"{name}: container {c['name']} runs with runAsGroup {group} and no runAsUser"


def main(paths):
    found, checked = [], 0
    for path in paths:
        with open(path, encoding="utf-8") as f:
            for doc in yaml.safe_load_all(f):
                if doc and doc.get("kind") in WORKLOADS:
                    checked += 1
                    found.extend(problems(doc))
    for line in found:
        print(f"::error::{line}")
    print(f"{checked} workload(s) checked, {len(found)} problem(s)")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
