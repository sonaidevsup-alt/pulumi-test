pipeline {
    agent any
    
    tools { nodejs 'node-lts' }

    environment {
        // --- A MÁGICA É ESSA LINHA: ---
        // O Jenkins pega do cofre (ID 'pulumi-token-id') e joga na variável que o Pulumi exige
        PULUMI_ACCESS_TOKEN = credentials('pulumi-token-id')
        
        // Mantemos a lógica da cor (mesmo que null, vai cair no blue por enquanto)
        COR_DO_DEPLOY = "${env.BRANCH_NAME == 'develop' ? 'green' : 'blue'}"
        KUBECONFIG = '/var/jenkins_home/kubeconfig'
    }

    stages {
        stage('Install') {
            steps { sh 'npm install' }
        }

        stage('Deploy') {
            steps {
                echo "--- Usando Token Seguro ---"
                // Adicionei --non-interactive para garantir que ele não trave pedindo confirmação
                sh 'pulumi up --yes --stack dev --non-interactive'
            }
        }
    }
}