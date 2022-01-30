package main

import (
	"bq-pipeline/pkg/common/log"
	"bq-pipeline/pkg/infrastructure/bigquery"
	"os"

	"bq-pipeline/pkg/user"
	"context"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

func handler(ctx context.Context, request events.SNSEvent) error {
  // インプットデータを生成
	inputUserData := user.User{ID: "1", Name: "hoge"}
	service := bigquery.Service{}
	client, err := bigquery.New(ctx)

	if err != nil {
		log.Error("bigquery client create failed", err)
		os.Exit(1)
	}
  if err := service.Upload(ctx, client, inputUserData); err != nil {
		return err
	}
	return nil
}

func main() {
	lambda.Start(handler)
}
