{{- define "healthcare-api.name" -}}
healthcare-api
{{- end }}

{{- define "healthcare-api.selectorLabels" -}}
app.kubernetes.io/name: {{ include "healthcare-api.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "healthcare-api.labels" -}}
{{ include "healthcare-api.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}
