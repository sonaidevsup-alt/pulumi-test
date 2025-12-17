import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

// --- 1. CLASSE MICROSERVICO (Padrão) ---
interface MicroServicoArgs {
    image: string;
    port: number;
    replicas?: number;
    env?: any[];
    isPublic?: boolean;
    command?: string[];
}

class MicroServico extends pulumi.ComponentResource {
    public readonly serviceName: pulumi.Output<string> | undefined;

    constructor(name: string, args: MicroServicoArgs, opts?: pulumi.ComponentResourceOptions) {
        super("custom:app:MicroServico", name, {}, opts);
        const labels = { app: name };

        const deployment = new k8s.apps.v1.Deployment(`${name}-deploy`, {
            spec: {
                selector: { matchLabels: labels },
                replicas: args.replicas || 1,
                template: {
                    metadata: { labels: labels },
                    spec: {
                        containers: [{
                            name: name,
                            image: args.image,
                            ports: [{ containerPort: args.port }],
                            env: args.env,
                            command: args.command,
                        }]
                    }
                }
            }
        }, { parent: this });

        const service = new k8s.core.v1.Service(`${name}-svc`, {
            metadata: { name: `${name}-service` },
            spec: {
                type: args.isPublic ? "LoadBalancer" : "ClusterIP",
                selector: labels,
                ports: [{ port: args.isPublic ? 80 : args.port, targetPort: args.port }]
            }
        }, { parent: this });

        this.serviceName = service.metadata.name;
        this.registerOutputs({ serviceName: this.serviceName });
    }
}

// --- 2. CONFIGURAÇÃO DE SEGURANÇA ---
const config = new pulumi.Config();
const redisPassword = config.requireSecret("redisPassword");

const k8sSecret = new k8s.core.v1.Secret("db-secrets", {
    metadata: { name: "db-secrets" },
    stringData: { "redis-pass": redisPassword },
});

// --- 3. MONITORAMENTO (PROMETHEUS + GRAFANA) ---
// Stack configurada para não falhar em ambiente local (Webhooks OFF + Root User ON)
const nsObs = new k8s.core.v1.Namespace("observabilidade", {
    metadata: { name: "monitoring" }
});

const stackMonitoramento = new k8s.helm.v3.Chart("kube-prometheus-stack", {
    chart: "kube-prometheus-stack",
    version: "48.1.1",
    namespace: nsObs.metadata.name,
    fetchOpts: { repo: "https://prometheus-community.github.io/helm-charts" },
    values: {
        // Mantemos os Webhooks desligados (Isso é importante!)
        prometheusOperator: {
            admissionWebhooks: { enabled: false },
            tls: { enabled: false }
        },
        // Voltamos ao padrão (Sem forçar Root)
        prometheus: {
            prometheusSpec: { 
                resources: { requests: { memory: "100Mi" } }
            }
        },
        grafana: {
            adminPassword: "admin"
            // Removi a parte do securityContext que estava dando erro
        }
    }
});

// --- 4. APLICAÇÃO ---
const redis = new MicroServico("redis", {
    image: "redis:alpine",
    port: 6379,
    command: ["/bin/sh", "-c", "redis-server --requirepass $(REDIS_PASS)"],
    env: [{ 
        name: "REDIS_PASS", 
        valueFrom: { secretKeyRef: { name: k8sSecret.metadata.name, key: "redis-pass" } } 
    }]
});

const backend = new MicroServico("backend", {
    image: "docker.io/sonaidev/meu-backend:v1",
    port: 3001,
    replicas: 1,
    env: [{ 
        name: "REDIS_URL", 
        value: pulumi.interpolate`redis://:${redisPassword}@${redis.serviceName}:6379`
    }]
});

const frontend = new MicroServico("frontend", {
    image: "docker.io/sonaidev/meu-frontend:v1",
    port: 3000,
    isPublic: true,
    env: [{ name: "REACT_APP_API_URL", value: "http://localhost:3001" }]
});

// 1. LER A VARIÁVEL DO SISTEMA (Vinda do Jenkins)
// Se não vier nada, assume 'blue' por segurança.
const activeColor = process.env.COR_DO_DEPLOY || "blue";

// 2. CRIAR AS DUAS VERSÕES
const appBlue = new MicroServico("app-blue", { image: "myapp:v1", port: 3000 });
const appGreen = new MicroServico("app-green", { image: "myapp:v2", port: 3000 });

// 3. DECIDIR QUEM SEGURA O TRÁFEGO
// Se activeColor for 'green', o serviceName aponta para o Green.
const finalService = activeColor === "green" ? appGreen.serviceName : appBlue.serviceName;

// 4. EXPORTAR A URL
export const url = pulumi.interpolate`http://${finalService}:80`;

// Debug: Para você ver no log do Jenkins o que ele escolheu
pulumi.log.info(`DEPLOY REALIZADO NA COR: ${activeColor}`);