pipeline {
    agent any
    
    tools { nodejs 'node-lts' }

    // Define a cor baseada na branch, mas permite mudar manualmente se precisar
    environment {
        // Se a branch for 'develop', força ser 'green'. Senão, 'blue'.
        COR_DO_DEPLOY = "${env.BRANCH_NAME == 'develop' ? 'green' : 'blue'}"
    }

    stages {
        stage('Install') {
            steps { sh 'npm install' }
        }

        stage('Deploy') {
            steps {
                echo "--- Detectado branch: ${env.BRANCH_NAME} ---"
                echo "--- Deployando versão: ${env.COR_DO_DEPLOY} ---"
                
                // O Pulumi vai ler a variável COR_DO_DEPLOY automaticamente
                sh 'pulumi up --yes --stack dev'
            }
        }
    }
}