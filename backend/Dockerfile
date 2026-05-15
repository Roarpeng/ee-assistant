FROM python:3.11-slim

WORKDIR /app

# Build args 接收 docker-compose 传入的代理(如 http://host.docker.internal:3128)
ARG HTTP_PROXY=
ARG HTTPS_PROXY=
ARG NO_PROXY=localhost,127.0.0.1,host.docker.internal

# 暴露给后续 RUN 使用(同时小写,apt/curl/pip 各家工具习惯不一)
ENV HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY} \
    NO_PROXY=${NO_PROXY} \
    http_proxy=${HTTP_PROXY} \
    https_proxy=${HTTPS_PROXY} \
    no_proxy=${NO_PROXY}

COPY requirements.txt .
RUN pip install --no-cache-dir \
      --index-url https://pypi.tuna.tsinghua.edu.cn/simple \
      --trusted-host pypi.tuna.tsinghua.edu.cn \
      -r requirements.txt

# 运行阶段不再需要 build 时的代理(由 docker-compose 的 environment 块清空)
ENV HTTP_PROXY="" HTTPS_PROXY="" NO_PROXY="" \
    http_proxy="" https_proxy="" no_proxy="" \
    PYTHONUNBUFFERED=1

COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
