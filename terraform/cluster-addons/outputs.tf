output "app_namespaces" {
  value = [for ns in kubernetes_namespace_v1.app : ns.metadata[0].name]
}

output "lb_controller_release" {
  value = "${helm_release.lb_controller.name} ${helm_release.lb_controller.version}"
}

output "security_group_policies" {
  description = "Namespaces that have a SecurityGroupPolicy (group IDs are not output)."
  value       = [for ns in keys(kubernetes_manifest.security_group_policy) : ns]
}
