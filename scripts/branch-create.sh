#!/bin/bash

create_branch() {
    if [ -z "$1" ] || [ -z "$2" ]; then
        echo "Usage: ./branch-create.sh ISSUE_NUMBER BRANCH_TITLE"
        exit 1
    fi

    ISSUE_NUMBER=$1
    BRANCH_TITLE=$(echo "$2" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-zA-Z0-9-]/-/g' | sed 's/-\+/-/g' | sed 's/^-\|-$//')

    gh issue develop ${ISSUE_NUMBER} -b dev -n feat/#${ISSUE_NUMBER}-${BRANCH_TITLE} --checkout

    if [ $? -eq 0 ]; then
        echo "Branch created successfully: feat/#${ISSUE_NUMBER}-${BRANCH_TITLE}"
    else
        echo "Failed to create branch"
        exit 1
    fi
}

create_branch "$1" "$2"