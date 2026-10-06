SERVER_USER ?= root
SERVER_HOST ?= 103.41.113.25
SERVER_ROOT ?= /home/cloudmn/kholboo-app
IMAGE_DIR ?= .deploy
ADMIN_IMAGE ?= kholboo-app-admin:deploy
BACKEND_IMAGE ?= kholboo-app-backend:deploy

test:
	npm --prefix ../KholbooApp-Admin test
	npm --prefix ../KholbooApp-Admin run build
	npm test

build:
	docker compose build

export-images:
	mkdir -p $(IMAGE_DIR)
	docker save -o $(IMAGE_DIR)/kholboo-app-admin.tar $(ADMIN_IMAGE)
	docker save -o $(IMAGE_DIR)/kholboo-app-backend.tar $(BACKEND_IMAGE)

push-code:
	ssh $(SERVER_USER)@$(SERVER_HOST) 'mkdir -p $(SERVER_ROOT)/images'
	cd .. && rsync -av --delete \
		--exclude=.git --exclude=node_modules --exclude=dist --exclude=.env \
		--exclude=.idea --exclude=.DS_Store --exclude=.deploy \
		KholbooApp-Admin KholbooApp-Back \
		$(SERVER_USER)@$(SERVER_HOST):$(SERVER_ROOT)/

push-images:
	rsync -av $(IMAGE_DIR)/kholboo-app-admin.tar $(IMAGE_DIR)/kholboo-app-backend.tar \
		$(SERVER_USER)@$(SERVER_HOST):$(SERVER_ROOT)/images/

load-images:
	ssh $(SERVER_USER)@$(SERVER_HOST) \
		'docker load -i $(SERVER_ROOT)/images/kholboo-app-admin.tar && \
		docker load -i $(SERVER_ROOT)/images/kholboo-app-backend.tar'

check-env:
	ssh $(SERVER_USER)@$(SERVER_HOST) 'test -s $(SERVER_ROOT)/KholbooApp-Back/.env'

up: check-env
	ssh $(SERVER_USER)@$(SERVER_HOST) \
		'cd $(SERVER_ROOT)/KholbooApp-Back && docker compose up -d --no-build'

deploy: test build export-images push-code push-images load-images up status

status:
	ssh $(SERVER_USER)@$(SERVER_HOST) \
		'cd $(SERVER_ROOT)/KholbooApp-Back && docker compose ps'

health:
	ssh $(SERVER_USER)@$(SERVER_HOST) \
		'curl -fsS http://127.0.0.1:4105/api/health && \
		curl -fsSI http://127.0.0.1:4106/app-admin/ | head -1'

logs:
	ssh $(SERVER_USER)@$(SERVER_HOST) \
		'cd $(SERVER_ROOT)/KholbooApp-Back && docker compose logs -f --tail=100'

restart:
	ssh $(SERVER_USER)@$(SERVER_HOST) \
		'cd $(SERVER_ROOT)/KholbooApp-Back && docker compose restart'

nginx-check:
	ssh $(SERVER_USER)@$(SERVER_HOST) 'nginx -t'

.PHONY: test build export-images push-code push-images load-images check-env up deploy status health logs restart nginx-check
