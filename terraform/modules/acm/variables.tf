variable "domain_name" {
  description = "Certificate domain, for example *.example.com."
  type        = string
}

variable "zone_id" {
  description = "Route 53 hosted zone for the validation records (ROUTE53_ZONE_ID)."
  type        = string
}
