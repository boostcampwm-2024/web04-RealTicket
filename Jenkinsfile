pipeline {
    agent any

    tools {
        nodejs 'node-20.18.0'
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '3'))
        disableConcurrentBuilds(abortPrevious: true)
        parallelsAlwaysFailFast()
        timeout(time: 30, unit: 'MINUTES')
        skipDefaultCheckout(true)
    }

    environment {
        CI = 'true'
        LUA_TEST_REDIS_HOST = 'host.docker.internal'
        LUA_TEST_REDIS_PORT = '6379'
        LUA_TEST_REDIS_DB = '15'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install dependencies') {
            parallel {
                stage('Frontend install') {
                    steps {
                        sh 'npm ci --prefix front'
                    }
                }

                stage('Backend install') {
                    steps {
                        sh 'npm ci --prefix back'
                    }
                }
            }
        }

        stage('Verify') {
            parallel {
                stage('Frontend') {
                    steps {
                        sh 'npm run test:front'
                        sh 'npm run build:front'
                    }
                }

                stage('Backend') {
                    steps {
                        sh 'npm --prefix back run test:unit -- --runInBand --silent'
                        sh 'npm --prefix back run test -- --runInBand --silent'
                        sh 'npm --prefix back run test:lua -- --runInBand'
                        sh 'npm run build:back'
                    }
                }
            }
        }
    }

    post {
        always {
            cleanWs(
                deleteDirs: true,
                disableDeferredWipeout: true
            )
        }
    }
}
